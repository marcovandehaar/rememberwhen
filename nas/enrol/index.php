<?php
declare(strict_types=1);

// Aanmeldpagina (ADR 0007): draait één keer per apparaat, nooit per verzoek.
// Controleert het huishoudwachtwoord, maakt een sleutelbestand in devices/ en
// zet de cookie die de drempel in de hoofd-.htaccess straks herkent.

const COOKIE_NAME = 'rw';
const COOKIE_DOMAIN = 'nas.vandehaar.dev';
const COOKIE_DAYS = 90;
const MAX_FAILURES = 8;
const LOCKOUT_SECONDS = 900;

$root = dirname(__DIR__);
$devices = $root . '/devices';
$base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/enrol/index.php')), '/\\') . '/';

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

function render(string $base, string $message, string $label = ''): void
{
    $m = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $l = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');
    $b = htmlspecialchars($base, ENT_QUOTES, 'UTF-8');
    $notice = $message === '' ? '' : "<p class=\"notice\">$m</p>";
    echo <<<HTML
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>rememberwhen</title>
<link rel="manifest" href="{$b}manifest.webmanifest">
<link rel="apple-touch-icon" href="{$b}apple-touch-icon.png">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #f2f2f2; font: 18px/1.4 system-ui, sans-serif; }
  main { width: min(420px, 100% - 48px); }
  h1 { font-size: 28px; margin: 0 0 4px; }
  p { color: #b5b5b5; margin: 0 0 20px; }
  label { display: block; margin: 16px 0 6px; }
  input { width: 100%; box-sizing: border-box; padding: 12px 14px; font: inherit; color: #fff; background: #1a1a1a; border: 1px solid #444; border-radius: 10px; }
  button { width: 100%; margin-top: 24px; padding: 14px; font: inherit; font-weight: 600; color: #000; background: #f2f2f2; border: 0; border-radius: 10px; }
  .notice { color: #ffb4a8; }
</style>
</head>
<body>
<main>
<h1>Dit apparaat koppelen</h1>
<p>Dit apparaat heeft nog geen sleutel. Een volwassene vult het huishoudwachtwoord in; daarna blijft het apparaat 90 dagen ingelogd.</p>
$notice
<form method="post" action="{$b}enrol/">
<label for="password">Huishoudwachtwoord</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<label for="label">Naam van het apparaat</label>
<input id="label" name="label" type="text" autocomplete="off" maxlength="40" placeholder="bijv. iPad van Emma" value="$l" required>
<button type="submit">Koppelen</button>
</form>
</main>
</body>
</html>
HTML;
}

function cleanLabel(string $raw): string
{
    // Geen geldige UTF-8 (geen browser doet dat): dan liever alleen het ASCII-deel dan niets.
    $stripped = preg_replace('/[\x00-\x1F\x7F]/u', '', $raw) ?? preg_replace('/[^\x20-\x7E]/', '', $raw);
    $label = trim((string) $stripped);
    preg_match('/^.{0,40}/us', $label, $m);
    $label = $m[0] ?? '';
    return $label === '' ? 'apparaat' : $label;
}

$secretFile = $devices . '/.enrol-secret';
$hash = is_file($secretFile) ? trim((string) file_get_contents($secretFile)) : '';
if ($hash === '') {
    render($base, 'Koppelen is nog niet ingesteld op de NAS.');
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    render($base, '');
    exit;
}

$label = cleanLabel((string) ($_POST['label'] ?? ''));

// Eén slot om de hele poging heen: pogingen lopen achter elkaar, dus de
// teller kan niet worden omzeild door er tegelijk veel te sturen.
$lock = fopen($devices . '/.enrol-attempts', 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) {
    render($base, 'Koppelen lukt nu niet. Probeer het zo opnieuw.', $label);
    exit;
}
$state = json_decode((string) stream_get_contents($lock), true);
$failures = is_array($state) ? (int) ($state['failures'] ?? 0) : 0;
$lockedUntil = is_array($state) ? (int) ($state['lockedUntil'] ?? 0) : 0;

$save = static function (int $f, int $until) use ($lock): void {
    ftruncate($lock, 0);
    rewind($lock);
    fwrite($lock, json_encode(['failures' => $f, 'lockedUntil' => $until]));
    fflush($lock);
};

if ($lockedUntil > time()) {
    render($base, 'Te veel pogingen. Probeer het over een kwartier opnieuw.', $label);
    exit;
}

if (!password_verify((string) ($_POST['password'] ?? ''), $hash)) {
    $failures++;
    $locked = $failures >= MAX_FAILURES;
    $save($locked ? 0 : $failures, $locked ? time() + LOCKOUT_SECONDS : 0);
    sleep(1);
    render($base, $locked ? 'Te veel pogingen. Probeer het over een kwartier opnieuw.' : 'Dat wachtwoord klopt niet.', $label);
    exit;
}

$save(0, 0);

$token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
$record = json_encode([
    'label' => $label,
    'enrolled' => date('c'),
    'agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

if (file_put_contents($devices . '/' . $token, $record . "\n", LOCK_EX) === false) {
    render($base, 'Het apparaat kon niet worden opgeslagen.', $label);
    exit;
}
chmod($devices . '/' . $token, 0644);

setcookie(COOKIE_NAME, $token, [
    'expires' => time() + COOKIE_DAYS * 86400,
    'path' => $base,
    'domain' => COOKIE_DOMAIN,
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
header('Location: ' . $base);
