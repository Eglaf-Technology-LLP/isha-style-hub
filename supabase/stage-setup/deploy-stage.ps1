# Deploys every edge function to the STAGE Supabase project and sets its
# secrets from supabase/stage-setup/.env.stage (git-ignored). If the three
# TWILIO_VERIFY_ values are filled in, it also turns on phone sign-in.
#
# Run from anywhere in PowerShell:
#   powershell -ExecutionPolicy Bypass -File supabase/stage-setup/deploy-stage.ps1
#
# It asks for a Supabase access token of the account that owns the stage
# project (supabase.com -> Account -> Access Tokens -> Generate). The token is
# typed hidden, used only for this run, and never saved. Your normal CLI login
# (live) is not changed. Press Enter without a token to use the normal login,
# which works only if it can see the stage project.
#
# Every command targets the stage ref. The live ref is refused.

param(
  [string]$StageRef = 'eytbtryvrerjayrrczjf',
  [string]$SecretsFile = (Join-Path $PSScriptRoot '.env.stage'),
  [switch]$SkipFunctions,
  [switch]$SkipSecrets
)

$ErrorActionPreference = 'Stop'
$LiveRef = 'whycxtnjhdbewgyugfax'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Stop-Script([string]$Message) {
  Write-Host ""
  Write-Host "STOPPED: $Message" -ForegroundColor Red
  Write-Host "Nothing was deployed or changed." -ForegroundColor Red
  exit 1
}

if ($StageRef -eq $LiveRef) { Stop-Script "$StageRef is the LIVE project. This script is for stage only." }
if ($StageRef -notmatch '^[a-z0-9]{20}$') { Stop-Script "'$StageRef' is not a Supabase project ref (20 lowercase letters/digits)." }

# ---------------------------------------------------------------- secrets file
$secrets = [ordered]@{}
# Phone sign-in (Twilio Verify) is a Supabase Auth setting, not an edge
# function secret, so these three are sent to the Auth config instead.
$verifyKeys = 'TWILIO_VERIFY_ACCOUNT_SID', 'TWILIO_VERIFY_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'
$verify = [ordered]@{}
if (-not $SkipSecrets) {
  if (-not (Test-Path $SecretsFile)) {
    Copy-Item (Join-Path $PSScriptRoot 'stage-secrets.template') $SecretsFile
    Write-Host "Created $SecretsFile" -ForegroundColor Yellow
    Write-Host "Fill in the values there (see the notes in the file), then run this script again."
    exit 1
  }

  Push-Location $RepoRoot
  try {
    & git check-ignore -q -- $SecretsFile
    $ignored = ($LASTEXITCODE -eq 0)
  } finally { Pop-Location }
  if (-not $ignored) { Stop-Script "$SecretsFile is not git-ignored. Keep secrets in a git-ignored file." }

  $lines = Get-Content -LiteralPath $SecretsFile -Encoding UTF8
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $eq = $t.IndexOf('=')
    if ($eq -lt 1) { Stop-Script "This line in $SecretsFile is not NAME=value: $t" }
    $name = $t.Substring(0, $eq).Trim()
    $value = $t.Substring($eq + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name -like 'SUPABASE_*') { Stop-Script "$name is set by Supabase itself. Remove it from $SecretsFile." }
    $secrets[$name] = $value
  }

  $required = 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
              'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_WEBHOOK_TOKEN', 'SHIPROCKET_SKIP_PICKUP',
              'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD'
  $missing = @($required | Where-Object { -not $secrets.Contains($_) -or $secrets[$_] -eq '' })
  if ($missing.Count) { Stop-Script "Fill in these in ${SecretsFile}: $($missing -join ', ')" }

  if ($secrets['RAZORPAY_KEY_ID'] -like 'rzp_live_*') { Stop-Script "RAZORPAY_KEY_ID is a LIVE Razorpay key. Use the Test mode key (rzp_test_...)." }
  if ($secrets['SHIPROCKET_SKIP_PICKUP'] -notin 'true', '1', 'yes') { Stop-Script "SHIPROCKET_SKIP_PICKUP must be true on stage, or stage bookings send real couriers." }
  if ($secrets['SMTP_PORT'] -ne '465') { Stop-Script "SMTP_PORT must be 465 (Supabase blocks 587)." }

  # No R2 on stage: photos go to stage's own Supabase Storage. An R2 value here
  # would also let stage's nightly media-cleanup work on a bucket.
  $r2 = 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'MEDIA_BASE_URL'
  $r2Set = @($r2 | Where-Object { $secrets.Contains($_) -and $secrets[$_] -ne '' })
  if ($r2Set.Count -gt 0) { Stop-Script "Stage does not use R2. Empty or remove these in ${SecretsFile}: $($r2Set -join ', ')" }

  if ($secrets.Contains('SITE_URL') -and $secrets['SITE_URL'] -ne '') {
    $site = $secrets['SITE_URL'].TrimEnd('/')
    if ($site -notmatch '^https?://') { Stop-Script "SITE_URL must start with https:// (the stage website's address)." }
    if ($site -match '^https?://(www\.)?allboutiqs\.com$') { Stop-Script "SITE_URL is the LIVE website. Use the stage website's address, or leave it empty." }
    $secrets['SITE_URL'] = $site
  }

  foreach ($k in $verifyKeys) {
    if ($secrets.Contains($k)) {
      if ($secrets[$k] -ne '') { $verify[$k] = $secrets[$k] }
      $secrets.Remove($k)
    }
  }
  if ($verify.Count -gt 0 -and $verify.Count -lt $verifyKeys.Count) { Stop-Script "Fill in all three Twilio Verify values ($($verifyKeys -join ', ')) or leave all three empty." }
  if ($verify.Count -gt 0) {
    if ($verify['TWILIO_VERIFY_ACCOUNT_SID'] -notmatch '^AC[0-9a-f]{32}$') { Stop-Script "TWILIO_VERIFY_ACCOUNT_SID must be the Account SID (AC + 32 characters, Twilio Console -> Account Info)." }
    if ($verify['TWILIO_VERIFY_SERVICE_SID'] -notmatch '^VA[0-9a-f]{32}$') { Stop-Script "TWILIO_VERIFY_SERVICE_SID must be the Verify Service SID (VA + 32 characters, Twilio Console -> Verify -> Services)." }
  }

  if (-not $secrets.Contains('OTP_HASH_SECRET') -or $secrets['OTP_HASH_SECRET'] -eq '') {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secrets['OTP_HASH_SECRET'] = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $updated = @($lines | ForEach-Object { if ($_ -match '^\s*OTP_HASH_SECRET\s*=') { "OTP_HASH_SECRET=$($secrets['OTP_HASH_SECRET'])" } else { $_ } })
    if (-not ($updated -match '^OTP_HASH_SECRET=')) { $updated += "OTP_HASH_SECRET=$($secrets['OTP_HASH_SECRET'])" }
    Set-Content -LiteralPath $SecretsFile -Value $updated -Encoding UTF8
    Write-Host "Generated OTP_HASH_SECRET and saved it in $SecretsFile."
  }

  # Only filled-in values are sent. Single quotes keep $, # and spaces literal.
  foreach ($k in @($secrets.Keys)) {
    if ($secrets[$k] -eq '') { $secrets.Remove($k); continue }
    if ($secrets[$k].Contains("'")) { Stop-Script "The value of $k contains a single quote ('). Set that one by hand in the dashboard and remove it from the file." }
  }
}

# ---------------------------------------------------------------- access token
$hadToken = Test-Path Env:SUPABASE_ACCESS_TOKEN
if (-not $hadToken) {
  $secure = Read-Host "Supabase access token of the account that owns $StageRef (sbp_..., hidden; Enter = normal login)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($token) {
    if ($token -notmatch '^sbp_[A-Za-z0-9]+$') { Stop-Script "That does not look like an access token (it starts with sbp_)." }
    $env:SUPABASE_ACCESS_TOKEN = $token
  }
  $token = $null
}
if ($verify.Count -gt 0 -and -not $env:SUPABASE_ACCESS_TOKEN) {
  Stop-Script "Turning on phone sign-in needs the access token (the normal login cannot be used for it). Run again and paste the token, or empty the three TWILIO_VERIFY_ values."
}

$tempEnv = $null
Push-Location $RepoRoot
try {
  # No 2>$null here: in Windows PowerShell 5.1 with ErrorActionPreference=Stop
  # a redirected stderr line from a native command becomes a terminating error.
  $json = (& npx --yes supabase@3.2.0 projects list --output-format json | Out-String)
  $start = $json.IndexOf('{')
  if ($start -lt 0) { Stop-Script "Could not list projects with this login: $json" }
  $list = $json.Substring($start) | ConvertFrom-Json
  if (-not $list.projects) { Stop-Script "Could not list projects with this login: $json" }
  $stage = @($list.projects | Where-Object { $_.ref -eq $StageRef })
  if (-not $stage.Count) {
    Stop-Script "This login cannot see project $StageRef (it sees: $(($list.projects | ForEach-Object { $_.ref }) -join ', ')). Use a token of the account that owns stage."
  }

  $dirty = (& git status --porcelain -- supabase/functions supabase/config.toml | Out-String).Trim()
  $count = @(Get-ChildItem (Join-Path $RepoRoot 'supabase\functions') -Directory | Where-Object { $_.Name -notlike '_*' }).Count

  Write-Host ""
  Write-Host "Target: $StageRef ($($stage[0].name), $($stage[0].region))" -ForegroundColor Cyan
  if (-not $SkipFunctions) { Write-Host "  - deploy all $count edge functions from this folder" }
  if (-not $SkipSecrets) { Write-Host "  - set $($secrets.Count) secrets: $(@($secrets.Keys) -join ', ')" }
  if ($verify.Count -gt 0) { Write-Host "  - turn on phone sign-in with Twilio Verify (Authentication -> Phone)" }
  if ($dirty) {
    Write-Host "  Note: these function files have uncommitted changes and would be deployed as they are now:" -ForegroundColor Yellow
    Write-Host $dirty -ForegroundColor Yellow
  }
  $answer = Read-Host "Type the stage ref to go ahead"
  if ($answer.Trim() -ne $StageRef) { Stop-Script "Not confirmed." }

  if (-not $SkipFunctions) {
    Write-Host ""
    Write-Host "Deploying functions (a few minutes)..." -ForegroundColor Cyan
    & npx --yes supabase@3.2.0 functions deploy --remote=$StageRef --use-api --yes
    if ($LASTEXITCODE -ne 0) { throw "Function deploy failed (exit $LASTEXITCODE). Fix the error above and run again: deploying is safe to repeat." }
  }

  if (-not $SkipSecrets) {
    Write-Host ""
    Write-Host "Setting secrets..." -ForegroundColor Cyan
    $tempEnv = Join-Path ([IO.Path]::GetTempPath()) ("stage-secrets-" + [guid]::NewGuid().ToString('N') + ".env")
    $content = @($secrets.Keys | ForEach-Object { "$_='$($secrets[$_])'" })
    [IO.File]::WriteAllLines($tempEnv, $content, (New-Object Text.UTF8Encoding($false)))
    & npx --yes supabase@3.2.0 secrets set --remote=$StageRef --env-file $tempEnv --yes
    if ($LASTEXITCODE -ne 0) { throw "Setting secrets failed (exit $LASTEXITCODE)." }
  }

  if ($verify.Count -gt 0) {
    Write-Host ""
    Write-Host "Turning on phone sign-in (Twilio Verify)..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $authUri = "https://api.supabase.com/v1/projects/$StageRef/config/auth"
    $headers = @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" }
    $body = @{
      external_phone_enabled                = $true
      sms_provider                          = 'twilio_verify'
      sms_twilio_verify_account_sid         = $verify['TWILIO_VERIFY_ACCOUNT_SID']
      sms_twilio_verify_auth_token          = $verify['TWILIO_VERIFY_AUTH_TOKEN']
      sms_twilio_verify_message_service_sid = $verify['TWILIO_VERIFY_SERVICE_SID']
    } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Patch -Uri $authUri -Headers $headers -ContentType 'application/json' -Body $body
    $auth = Invoke-RestMethod -Method Get -Uri $authUri -Headers $headers
    if (-not $auth.external_phone_enabled -or $auth.sms_provider -ne 'twilio_verify' -or $auth.sms_twilio_verify_account_sid -ne $verify['TWILIO_VERIFY_ACCOUNT_SID']) {
      throw "Phone sign-in did not turn on. Check Authentication -> Sign In / Providers -> Phone in the dashboard."
    }
    Write-Host "Phone sign-in is on (Twilio Verify)."
  }

  Write-Host ""
  Write-Host "Done. Secret names now on ${StageRef}:" -ForegroundColor Green
  & npx --yes supabase@3.2.0 secrets list --remote=$StageRef
}
finally {
  if ($tempEnv -and (Test-Path $tempEnv)) { Remove-Item -LiteralPath $tempEnv -Force }
  if (-not $hadToken) { Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
  Pop-Location
}
