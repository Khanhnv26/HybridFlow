$ErrorActionPreference = 'Stop'

# Run after revoking the exposed token through Telegram's official @BotFather.
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'backend/application-local.properties'
$secureToken = Read-Host 'New token from @BotFather (input hidden)' -AsSecureString
$tokenPointer = [IntPtr]::Zero

try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer).Trim()
    if ($token -notmatch '^[0-9]{6,12}:[A-Za-z0-9_-]{30,50}$') {
        throw 'Invalid token format. Configuration was not changed.'
    }

    # Refuse to save a secret unless this file is both untracked and ignored.
    Push-Location $repoRoot
    try {
        $tracked = git ls-files -- backend/application-local.properties
        if ($LASTEXITCODE -ne 0 -or $tracked) {
            throw 'Cannot verify that local configuration is untracked.'
        }
        git check-ignore --quiet -- backend/application-local.properties
        if ($LASTEXITCODE -ne 0) {
            throw 'Local configuration must be ignored by Git before saving a token.'
        }
    } finally {
        Pop-Location
    }

    $content = if (Test-Path -LiteralPath $configPath) {
        [IO.File]::ReadAllText($configPath)
    } else { '' }
    $setting = 'telegram.bot.token=${TELEGRAM_BOT_TOKEN:' + $token + '}'
    $pattern = '(?m)^[ \t]*telegram\.bot\.token[ \t]*[=:][^\r\n]*'
    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $setting)
    } else {
        $content = $content.TrimEnd() + "`r`n" + $setting + "`r`n"
    }
    [IO.File]::WriteAllText($configPath, $content, [Text.UTF8Encoding]::new($false))
    Write-Host 'New token saved to ignored local configuration.'
    Write-Host 'If TELEGRAM_BOT_TOKEN is set in your backend environment, update it too.'
    Write-Host 'Restart the backend, then use the Telegram test button in the app.'
} finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $token = $null
    $content = $null
    $setting = $null
    $secureToken.Dispose()
}
