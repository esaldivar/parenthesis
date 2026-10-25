<#
.SYNOPSIS
Sets up, or removes, the hourly Windows scheduled task for the local Claude queue (#94).

.DESCRIPTION
Makes a dedicated checkout of the active release next to this repository (..\parenthesis-queue) if there isn't one,
and registers the "Parenthesis Claude queue" task. Every hour while you're signed in to Windows, the task runs
`pythonw scripts\claude_queue_run.py --scheduled` there, with no window. Each run updates that checkout to the active
release first. Runbook: docs/runbooks/claude-local-queue.md.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\claude_queue_schedule.ps1           # set up or update
powershell -ExecutionPolicy Bypass -File scripts\claude_queue_schedule.ps1 -Remove   # remove the task
#>
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$TaskName = 'Parenthesis Claude queue'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the '$TaskName' task. The queue checkout and logs are kept."
    } else {
        Write-Host "There is no '$TaskName' task."
    }
    return
}

$repo = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$runner = Get-Content (Join-Path $repo 'scripts\claude_queue_run.py') -Raw -Encoding UTF8
if ($runner -notmatch 'ACTIVE_RELEASE = "([^"]+)"') { throw 'Could not read ACTIVE_RELEASE from the runner.' }
$release = $Matches[1]
if ($runner -notmatch '--scheduled') { throw 'This runner has no --scheduled mode; update the checkout first.' }

# Tools the runner needs, from the PATH the task will get (not this terminal's).
$dirs = ([Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
         [Environment]::GetEnvironmentVariable('Path', 'Machine')).Split(';') | Where-Object { $_ }
function Find-Tool([string]$name) {
    foreach ($d in $dirs) {
        foreach ($ext in '.exe', '.cmd') {
            $f = Join-Path ([Environment]::ExpandEnvironmentVariables($d)) "$name$ext"
            if (Test-Path $f) { return $f }
        }
    }
    return $null
}
$missing = @('pythonw', 'claude', 'gh', 'git', 'node', 'npm', 'dotnet', 'docker') | Where-Object { -not (Find-Tool $_) }
if ($missing) { throw "Not on your saved PATH: $($missing -join ', '). Install them or add them to PATH, then run this again." }
$pythonw = Find-Tool 'pythonw'
if (-not [Environment]::GetEnvironmentVariable('DISCORD_WEBHOOK_URL', 'User')) {
    Write-Warning 'DISCORD_WEBHOOK_URL is not set as a user environment variable: runs will work, but you will get no Discord notices and major PRs will stop before pushing (runbook, "One-time setup").'
}

# The dedicated checkout the task runs from: detached, never your own working copy.
$queue = Join-Path (Split-Path $repo -Parent) 'parenthesis-queue'
if (-not (Test-Path $queue)) {
    git -C $repo fetch -q origin $release
    git -C $repo worktree add -q --detach $queue "origin/$release"
    if ($LASTEXITCODE) { throw "Could not create the queue checkout at $queue." }
    Write-Host "Created the queue checkout: $queue"
} else {
    $mine = (Resolve-Path (git -C $repo rev-parse --git-common-dir)).Path
    $theirs = (Resolve-Path (git -C $queue rev-parse --git-common-dir)).Path
    if ($mine -ne $theirs) { throw "$queue exists but isn't a checkout of this repository. Move it and run this again." }
    if (git -C $queue symbolic-ref -q HEAD) { throw "$queue is on a branch; scheduled runs need a detached checkout." }
}

$action = New-ScheduledTaskAction -Execute $pythonw -Argument 'scripts\claude_queue_run.py --scheduled' -WorkingDirectory $queue
$next = (Get-Date).Date.AddHours((Get-Date).Hour + 1)
$trigger = New-ScheduledTaskTrigger -Once -At $next -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Local Claude queue (#94): runs one owner-approved issue an hour at most and opens a draft PR into $release. Runbook: docs/runbooks/claude-local-queue.md" `
    -Force | Out-Null

Write-Host "Registered '$TaskName': every hour from $($next.ToString('t')), while you're signed in to Windows."
Write-Host "Runs from $queue on $release. Logs: $repo\.git\claude-queue\ (idle checks leave none)."
Write-Host "Run once now: Start-ScheduledTask -TaskName '$TaskName'   Remove: add -Remove to this script."
