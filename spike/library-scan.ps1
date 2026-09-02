# Bibliotheekscan voor issue #18.
# Leest per bestand wat de Indexer straks nodig heeft: type, grootte, afmetingen,
# opnametijd en of er GPS in zit. Wegwerpcode -- het levert een feit op, geen product.
#
# Twee routes, want geen van beide dekt alles:
#   - foto's : WIC (System.Windows.Media.Imaging). Leest ook HEIC, en als enige de GPS-tags;
#              de Shell-eigenschappen van deze machine kennen helemaal geen latitude/longitude.
#   - video's: de Shell, met de property-indices die op deze machine gelden.
#
# De bevindingen staan in docs/research/library-survey.md. Over dertien mappen op
# \\vandehaarnas\Fotos duurde dit 223 seconden.
#
#   .\library-scan.ps1 -Paths '\\vandehaarnas\Fotos\Canada 2013', '...' -Out .\library.csv
#
# De CSV gaat NIET in de repo: die bevat de bestandsnamen van een privebibliotheek,
# en deze repo is publiek.

param([string[]]$Paths, [string]$Out)

Add-Type -AssemblyName PresentationCore
$ErrorActionPreference = 'SilentlyContinue'

$IMG = @('.jpg', '.jpeg', '.heic', '.heif', '.png', '.gif', '.webp', '.tif', '.tiff', '.bmp')
$VID = @('.mov', '.mp4', '.mts', '.m2ts', '.mpg', '.mpeg', '.avi', '.m4v', '.3gp', '.wmv')

# indices op deze machine, opgevraagd via GetDetailsOf($null, i)
$P = @{ MediaCreated = 215; Duration = 43; FrameW = 331; FrameH = 329; BitRate = 28; DateTaken = 12 }

$shell = New-Object -ComObject Shell.Application
$nsCache = @{}
function Get-Ns($dir) {
  if (-not $nsCache.ContainsKey($dir)) { $nsCache[$dir] = $shell.Namespace($dir) }
  $nsCache[$dir]
}

$rows = New-Object System.Collections.Generic.List[object]

foreach ($root in $Paths) {
  $label = ($root -replace '^\\\\vandehaarnas\\Fotos\\', '')
  $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force |
           Where-Object { $_.FullName -notmatch '\\@eaDir\\' }
  foreach ($f in $files) {
    $ext = $f.Extension.ToLower()
    $r = [ordered]@{
      Map = $label; Naam = $f.Name; Ext = $ext; Bytes = $f.Length
      Soort = if ($IMG -contains $ext) { 'foto' } elseif ($VID -contains $ext) { 'video' } else { 'anders' }
      W = $null; H = $null; Opname = $null; OpnameBron = $null
      GPS = $false; Maker = $null; Model = $null; Duur = $null; Leesbaar = $true; Fout = $null
    }

    if ($r.Soort -eq 'foto') {
      try {
        $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
          [uri]$f.FullName,
          [System.Windows.Media.Imaging.BitmapCreateOptions]::DelayCreation,
          [System.Windows.Media.Imaging.BitmapCacheOption]::None)
        $fr = $dec.Frames[0]
        $r.W = $fr.PixelWidth; $r.H = $fr.PixelHeight
        $m = $fr.Metadata
        if ($m) {
          if ($m.DateTaken) { $r.Opname = $m.DateTaken; $r.OpnameBron = 'EXIF DateTaken' }
          $r.Maker = $m.CameraManufacturer; $r.Model = $m.CameraModel
          foreach ($q in '/app1/ifd/gps/{ushort=2}', '/ifd/gps/{ushort=2}', '/xmp/exif:GPSLatitude') {
            if ($m.GetQuery($q)) { $r.GPS = $true; break }
          }
        }
      } catch { $r.Leesbaar = $false; $r.Fout = $_.Exception.GetType().Name }
    }
    elseif ($r.Soort -eq 'video') {
      try {
        $ns = Get-Ns $f.DirectoryName
        $it = $ns.ParseName($f.Name)
        $mc = $ns.GetDetailsOf($it, $P.MediaCreated)
        if ($mc) { $r.Opname = ($mc -replace "[^\x20-\x7E]", '').Trim(); $r.OpnameBron = 'Media created' }
        $r.Duur = $ns.GetDetailsOf($it, $P.Duration)
        $w = $ns.GetDetailsOf($it, $P.FrameW); $h = $ns.GetDetailsOf($it, $P.FrameH)
        if ($w) { $r.W = [int]($w -replace '\D', '') }
        if ($h) { $r.H = [int]($h -replace '\D', '') }
      } catch { $r.Leesbaar = $false; $r.Fout = $_.Exception.GetType().Name }
    }

    # mtime als laatste redmiddel, zodat zichtbaar wordt hoe vaak dat nodig is
    if (-not $r.Opname) { $r.Opname = $f.LastWriteTime; $r.OpnameBron = 'mtime (GEEN metadata)' }

    $rows.Add([pscustomobject]$r)
  }
  Write-Host ("  {0,-32} {1,5} bestanden" -f $label, $files.Count)
}

$rows | Export-Csv -LiteralPath $Out -NoTypeInformation -Encoding UTF8
Write-Host ("KLAAR: {0} bestanden -> {1}" -f $rows.Count, $Out)
