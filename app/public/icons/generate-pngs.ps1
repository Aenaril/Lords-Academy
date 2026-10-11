# Script PowerShell pour générer les icônes PNG
# Utilise un SVG embeddé et le convertit en PNG via PowerShell + Windows

$IconsDir = "$PSScriptRoot"

# Fonction pour créer une image PNG simple avec du texte
function New-SimplePNG {
    param(
        [string]$OutputPath,
        [int]$Size,
        [string]$BgColor = "#C41E3A",
        [string]$TextColor = "#FFFFFF"
    )

    # Créer un SVG temporaire
    $SvgPath = [System.IO.Path]::GetTempFileName() + ".svg"
    
    $SvgContent = @"
<svg width="$Size" height="$Size" xmlns="http://www.w3.org/2000/svg">
  <rect width="$Size" height="$Size" fill="$BgColor"/>
  <text x="$($Size/2)" y="$($Size/2 + $Size/8)" 
        text-anchor="middle" 
        font-size="$($Size * 0.5)" 
        fill="$TextColor"
        font-family="Arial, sans-serif"
        font-weight="bold">⚔</text>
</svg>
"@

    # Écrire le SVG
    Set-Content -Path $SvgPath -Value $SvgContent -Encoding UTF8

    Write-Host "Pour générer les PNG manuellement:"
    Write-Host "1. Ouvrez le SVG: $SvgPath"
    Write-Host "2. Exportez en PNG $($Size)x$($Size)"
    Write-Host "3. Sauvegardez dans: $OutputPath"
    
    # Nettoyer
    Remove-Item $SvgPath -Force -ErrorAction SilentlyContinue
}

Write-Host "=== Génération des icônes PNG ===" 
Write-Host "Les icônes PNG doivent être créées manuellement ou via un outil graphique."
Write-Host ""
Write-Host "Icônes requises:"
New-SimplePNG -OutputPath "$IconsDir\icon-192.png" -Size 192
Write-Host ""
New-SimplePNG -OutputPath "$IconsDir\icon-512.png" -Size 512
Write-Host ""
New-SimplePNG -OutputPath "$IconsDir\apple-touch-icon-180.png" -Size 180 -BgColor "#FFFFFF" -TextColor "#C41E3A"
Write-Host ""
Write-Host "Alternative: utiliser tools/pwa-icon-generator ou un outil en ligne"
