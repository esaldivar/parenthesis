$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/windows-nvda-candidate.ps1"

function Assert-Throws([scriptblock]$Operation, [string]$Message) {
  try { & $Operation } catch {
    if ($_.Exception.Message -notlike "*$Message*") { throw }
    return
  }
  throw "Expected failure containing: $Message"
}

$originalTemp = $env:RUNNER_TEMP
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "nvda-script-tests-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $testRoot | Out-Null
$env:RUNNER_TEMP = $testRoot
try {
  $state = Get-CandidateState ''
  Assert-Throws { Get-CandidateState $testRoot } 'below RUNNER_TEMP'
  Assert-Throws { Get-CandidateState (Join-Path $testRoot '../outside') } 'below RUNNER_TEMP'
  Assert-Throws { Get-CandidateState "$testRoot-sibling/state" } 'below RUNNER_TEMP'
  Write-Output 'PASS: state cannot escape the disposable root or use the root itself.'

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  try { Assert-Throws { Assert-FreePort $port } '' } finally { $listener.Stop() }
  Assert-FreePort $port
  Write-Output 'PASS: occupied ports fail instead of connecting to an existing application.'

  Assert-Throws { Wait-CandidateUrl 'https://example.com/health/ready' -TimeoutSeconds 0 } 'loopback'
  Assert-Throws { Wait-CandidateUrl "http://127.0.0.1:$port" -TimeoutSeconds 0 } 'readiness failed'
  Write-Output 'PASS: remote readiness endpoints and unavailable local candidates fail.'

  New-Item -ItemType Directory -Path $state, (Join-Path $state 'logs') | Out-Null
  $badZip = Join-Path $state 'bad.zip'
  Set-Content $badZip 'not a verified archive'
  Assert-Throws { Install-Archive 'https://example.com/unused' ('0' * 64) $badZip (Join-Path $state 'extracted') } 'Checksum mismatch'
  if (Test-Path (Join-Path $state 'extracted')) { throw 'An invalid archive was extracted.' }
  Write-Output 'PASS: checksum mismatch fails before extraction.'

  $record = Join-Path $state 'unrelated.process.json'
  @{ id = $PID; startedTicks = -1 } | ConvertTo-Json | Set-Content $record
  Assert-Throws { Stop-CandidateProcess $record } 'reused process ID'
  Write-Output 'PASS: cleanup refuses a reused process ID.'

  # Exercise actual child lifecycle and HTTP status handling without an app, NVDA or database.
  $serverFile = Join-Path $state 'server.cjs'
  Set-Content $serverFile "require('http').createServer((req,res)=>{res.statusCode=req.url==='/ready'?200:503;res.end('test');}).listen($port,'127.0.0.1');"
  $server = Start-CandidateProcess $state 'test-server' (Get-Command node).Source @('server.cjs') $state
  try {
    Wait-CandidateUrl "http://127.0.0.1:$port/ready" -Process $server -TimeoutSeconds 10 | Out-Null
    Assert-Throws { Wait-CandidateUrl "http://127.0.0.1:$port/not-ready" -Process $server -TimeoutSeconds 0 } 'readiness failed'
  } finally { Stop-CandidateProcess (Join-Path $state 'test-server.process.json') }
  Assert-Throws { Wait-CandidateUrl "http://127.0.0.1:$port/ready" -Process $server -TimeoutSeconds 0 } 'exited before readiness'
  Write-Output 'PASS: readiness requires HTTP 200, handles 503, and detects exited children; cleanup stops the owned child.'
} finally {
  $env:RUNNER_TEMP = $originalTemp
  $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolvedRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup path.' }
  # Start-Process drains redirected streams asynchronously after the child exits.
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try { Remove-Item -LiteralPath $resolvedRoot -Recurse -Force; break }
    catch { if ($attempt -eq 4) { throw }; Start-Sleep -Milliseconds 250 }
  }
}
