param(
  [ValidateSet('Install', 'Start', 'Stop')][string]$Action,
  [string]$StateDirectory,
  [string]$DownloadDirectory,
  [int]$AppPort = 8443,
  [int]$PostgresPort = 5433,
  [int]$MailPort = 8025,
  [int]$SmtpPort = 1025
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CandidateState([string]$Requested) {
  if (-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP must identify a disposable runner directory.' }
  $root = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $path = [IO.Path]::GetFullPath($(if ($Requested) { $Requested } else { Join-Path $root 'nvda-candidate' }))
  if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate state must be below RUNNER_TEMP.' }
  return $path
}

function Assert-FreePort([int]$Port) {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
  try { $listener.Start() } finally { $listener.Stop() }
}

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($Program)) exited $LASTEXITCODE" }
}

function Install-Archive([string]$Url, [string]$Hash, [string]$Archive, [string]$Destination, [string[]]$Prefixes = @()) {
  if (-not (Test-Path -LiteralPath $Archive)) { Invoke-WebRequest -Uri $Url -OutFile $Archive }
  if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $Hash) { throw "Checksum mismatch: $Archive" }
  # Skip bundled pgAdmin/documentation; only server runtime directories are needed.
  $destinationRoot = [IO.Path]::GetFullPath($Destination).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    foreach ($entry in $zip.Entries) {
      if ($Prefixes.Count -and -not @($Prefixes | Where-Object { $entry.FullName.StartsWith($_) }).Count) { continue }
      $target = [IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
      if (-not $target.StartsWith($destinationRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry escapes its destination.' }
      if (-not $entry.Name) { continue }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally { $zip.Dispose() }
}

function Start-CandidateProcess([string]$State, [string]$Name, [string]$Program, [string[]]$Arguments, [string]$WorkingDirectory) {
  $process = Start-Process -FilePath $Program -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $State "logs/$Name.stdout.log") `
    -RedirectStandardError (Join-Path $State "logs/$Name.stderr.log")
  @{ id = $process.Id; startedTicks = $process.StartTime.ToUniversalTime().Ticks } |
    ConvertTo-Json | Set-Content (Join-Path $State "$Name.process.json")
  return $process
}

function Stop-CandidateProcess([string]$Record) {
  if (-not (Test-Path -LiteralPath $Record)) { return }
  $saved = Get-Content -Raw -LiteralPath $Record | ConvertFrom-Json
  $process = Get-Process -Id $saved.id -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if ($process.StartTime.ToUniversalTime().Ticks -ne $saved.startedTicks) { throw 'Refusing to stop a reused process ID.' }
  Stop-Process -Id $process.Id -ErrorAction Stop
  $process.WaitForExit()
  $process.Dispose()
}

function Wait-CandidateUrl([string]$Url, [int]$ExpectedStatus = 200, [int]$TimeoutSeconds = 60, [Diagnostics.Process]$Process) {
  $uri = [Uri]$Url
  if ($uri.Host -notin @('localhost', '127.0.0.1', '[::1]')) { throw 'Readiness checks must use loopback.' }
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if ($Process -and $Process.HasExited) { throw "Candidate process exited before readiness: $Url" }
    try {
      $response = Invoke-WebRequest -Uri $uri -SkipCertificateCheck -TimeoutSec 3 -MaximumRedirection 0
      if ([int]$response.StatusCode -eq $ExpectedStatus) { return $response }
    } catch { }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Candidate readiness failed: $Url (expected $ExpectedStatus)"
}

function Invoke-Candidate([string]$Mode, [string]$State, [string]$Downloads) {
  $marker = Join-Path $State 'owner.json'
  if ($Mode -eq 'Install') {
    if ((Test-Path -LiteralPath $State) -and -not (Test-Path -LiteralPath $marker)) { throw 'Refusing to use unowned state directory.' }
    New-Item -ItemType Directory -Force -Path $State, (Join-Path $State 'logs') | Out-Null
    @{ schema = 1; directory = $State } | ConvertTo-Json | Set-Content $marker
    if (-not $Downloads) { $Downloads = Join-Path $env:RUNNER_TEMP 'nvda-downloads' }
    New-Item -ItemType Directory -Force -Path $Downloads | Out-Null
    Install-Archive 'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip' `
      '6EABDF00D2893713B75DB4336A23C3FDF505F056E217EC6E2E95D901750CFEA3' `
      (Join-Path $Downloads 'postgresql-17.11-1-windows-x64-binaries.zip') (Join-Path $State 'postgres') @('pgsql/bin/', 'pgsql/lib/', 'pgsql/share/')
    Install-Archive 'https://github.com/axllent/mailpit/releases/download/v1.31.6/mailpit-windows-amd64.zip' `
      '5D5AD094BFB3BAC9004F9D1105D2335FEA9F8952C09951DF73AE0A280E34D3B1' `
      (Join-Path $Downloads 'mailpit-windows-amd64-1.31.6.zip') (Join-Path $State 'mailpit')
    return
  }
  if (-not (Test-Path -LiteralPath $marker)) {
    if ($Mode -eq 'Stop') { return }
    throw 'Install candidate tools first.'
  }
  $owner = Get-Content -Raw $marker | ConvertFrom-Json
  if ($owner.schema -ne 1 -or $owner.directory -ne $State) { throw 'Invalid candidate state ownership.' }
  $pgBin = Join-Path $State 'postgres/pgsql/bin'
  $pgData = Join-Path $State 'pgdata'
  if ($Mode -eq 'Stop') {
    $failures = @()
    foreach ($name in @('api', 'mailpit')) {
      try { Stop-CandidateProcess (Join-Path $State "$name.process.json") } catch { $failures += $_.Exception.Message }
    }
    if (Test-Path -LiteralPath (Join-Path $pgData 'postmaster.pid')) {
      try { Invoke-Checked (Join-Path $pgBin 'pg_ctl.exe') @('-D', $pgData, '-m', 'fast', '-w', 'stop') } catch { $failures += $_.Exception.Message }
    }
    if ($failures.Count) { throw ($failures -join '; ') }
    return
  }

  $ports = @($AppPort, $PostgresPort, $MailPort, $SmtpPort)
  if (@($ports | Select-Object -Unique).Count -ne 4) { throw 'Candidate ports must be distinct.' }
  foreach ($port in $ports) { Assert-FreePort $port }
  if (Test-Path -LiteralPath $pgData) { throw 'Start requires a fresh disposable database directory.' }
  $app = Join-Path $State 'app'
  $source = Get-Content -Raw (Join-Path $app 'candidate-source.json') | ConvertFrom-Json
  $sha = (& git rev-parse HEAD).Trim()
  $tree = (& git rev-parse 'HEAD^{tree}').Trim()
  if ($source.sha -ne $sha -or $source.tree -ne $tree) { throw 'Published candidate source does not match this checkout.' }
  $password = [Guid]::NewGuid().ToString('N')
  $passwordFile = Join-Path $State 'postgres-password.txt'
  Set-Content -LiteralPath $passwordFile -Value $password -NoNewline
  Invoke-Checked (Join-Path $pgBin 'initdb.exe') @('-D', $pgData, '-U', 'e2e', '--auth=scram-sha-256', "--pwfile=$passwordFile", '--encoding=UTF8', '--locale=C')
  Invoke-Checked (Join-Path $pgBin 'pg_ctl.exe') @('-D', $pgData, '-l', (Join-Path $State 'logs/postgres.log'), '-o', "-h 127.0.0.1 -p $PostgresPort", '-w', 'start')
  $env:PGPASSWORD = $password
  try { Invoke-Checked (Join-Path $pgBin 'createdb.exe') @('-h', '127.0.0.1', '-p', "$PostgresPort", '-U', 'e2e', 'coparent') }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

  $mail = Start-CandidateProcess $State 'mailpit' (Join-Path $State 'mailpit/mailpit.exe') `
    @('--listen', "127.0.0.1:$MailPort", '--smtp', "127.0.0.1:$SmtpPort", '--database', "`"$(Join-Path $State 'mailpit.db')`"") $State
  Wait-CandidateUrl "http://127.0.0.1:$MailPort/api/v1/info" -Process $mail | Out-Null

  $key = [Security.Cryptography.RSA]::Create(2048)
  try {
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $key, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $san.AddDnsName('localhost')
    $san.AddIpAddress([Net.IPAddress]::Loopback)
    $request.CertificateExtensions.Add($san.Build())
    $certificate = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddDays(1))
    try {
      [IO.File]::WriteAllText((Join-Path $State 'cert.pem'), $certificate.ExportCertificatePem())
      [IO.File]::WriteAllText((Join-Path $State 'key.pem'), $key.ExportPkcs8PrivateKeyPem())
    } finally { $certificate.Dispose() }
  } finally { $key.Dispose() }

  # Environment belongs only to this runner process and its children, never user-secrets or production.
  $env:ConnectionStrings__Postgres = "Host=127.0.0.1;Port=$PostgresPort;Database=coparent;Username=e2e;Password=$password"
  $env:ASPNETCORE_ENVIRONMENT = 'Production'
  $env:ASPNETCORE_URLS = "https://127.0.0.1:$AppPort"
  $env:ASPNETCORE_HTTP_PORTS = ''
  $env:Kestrel__Certificates__Default__Path = Join-Path $State 'cert.pem'
  $env:Kestrel__Certificates__Default__KeyPath = Join-Path $State 'key.pem'
  $env:App__PublicBaseUrl = "https://localhost:$AppPort"
  $env:Email__Smtp__Host = '127.0.0.1'
  $env:Email__Smtp__Port = "$SmtpPort"
  $env:Email__Smtp__UseStartTls = 'false'
  $env:Identity__AuthRateLimit__PermitLimit = '1000'
  # Keep credentials/SQL parameters out of diagnostics; HTTP logging already excludes bodies/headers.
  $env:Logging__LogLevel__Default = 'Warning'
  Push-Location $app
  try {
    & dotnet CoParent.Api.dll migrate *> (Join-Path $State 'logs/migrations.log')
    if ($LASTEXITCODE -ne 0) { throw "Candidate migrations failed (exit $LASTEXITCODE)." }
  } finally { Pop-Location }
  $api = Start-CandidateProcess $State 'api' (Get-Command dotnet).Source @('CoParent.Api.dll') $app
  Wait-CandidateUrl "https://127.0.0.1:$AppPort/health/ready" -Process $api | Out-Null
  $html = Wait-CandidateUrl "https://127.0.0.1:$AppPort/sign-in" -Process $api
  if ($html.Content -notmatch '<app-root') { throw 'Candidate did not serve the built Angular application.' }
  Wait-CandidateUrl "https://127.0.0.1:$AppPort/api/antiforgery" -ExpectedStatus 204 -Process $api | Out-Null
  $versions = @{
    sourceSha = $sha; sourceTree = $tree; startedAt = [DateTime]::UtcNow.ToString('O')
    postgres = (& (Join-Path $pgBin 'postgres.exe') --version) -join ' '
    mailpit = (& (Join-Path $State 'mailpit/mailpit.exe') version) -join ' '
    dotnet = (& dotnet --version) -join ' '
    windows = [Environment]::OSVersion.VersionString
    appUrl = "https://localhost:$AppPort"; mailpitUrl = "http://127.0.0.1:$MailPort"
  }
  $versions | ConvertTo-Json | Set-Content (Join-Path $State 'logs/candidate.json')
  Write-Output "Candidate ready at https://localhost:$AppPort ($sha)."
}

if ($MyInvocation.InvocationName -ne '.') {
  if (-not $Action) { throw 'Specify -Action Install, Start or Stop.' }
  Invoke-Candidate $Action (Get-CandidateState $StateDirectory) $DownloadDirectory
}
