# ContentE Web Local HTTP Server
$port = 8080
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener

try {
    $listener.Prefixes.Add($prefix)
    $listener.Start()
} catch {
    $port = 8085
    $prefix = "http://localhost:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "========================================="
Write-Host "  ContentE Web Server running at $prefix"
Write-Host "========================================="

# Launch default browser
try {
    Start-Process $prefix
} catch {
    Write-Host "Could not automatically open browser. Please open $prefix in your browser."
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".tif"  = "image/tiff"
    ".tiff" = "image/tiff"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
    ".xml"  = "application/xml; charset=utf-8"
}

$baseDir = $PSScriptRoot
if (-not $baseDir) { $baseDir = (Get-Location).Path }

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($rawUrl -eq "/" -or $rawUrl -eq "") {
            $rawUrl = "/index.html"
        }

        $subPath = $rawUrl.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($baseDir, $subPath))

        if (-not $filePath.StartsWith($baseDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $response.ContentType = $contentType
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Cache-Control", "no-cache")

            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $fileBytes.Length
            $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
        } else {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
    } catch {
        # Continue listening
    }
}
