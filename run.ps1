# PowerShell Master Runner for TCP Wi-Fi Performance Analysis Framework
# Usage:
#   .\run.ps1 test         - Run full unit & integration test suite
#   .\run.ps1 demo         - Run complete simulation, ML training & graph generation
#   .\run.ps1 loopback     - Run local real TCP client-server session & plot graphs
#   .\run.ps1 web          - Launch the modern React Frosted-Glass Web Dashboard (Vite)
#   .\run.ps1 dashboard    - Launch the Streamlit Python Dashboard
#   .\run.ps1 clean        - Clean temporary files and caches

param (
    [string]$Action = "web"
)

$ErrorActionPreference = "Stop"
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectPath

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TCP Dynamic Wi-Fi Packet Loss Framework ($Action)" -ForegroundColor Cyan
Write-Host " Authors: Bassil H, Ajitesh Mohan N, Abijith V K" -ForegroundColor DarkCyan
Write-Host "==========================================================" -ForegroundColor Cyan

switch ($Action.ToLower()) {
    "test" {
        Write-Host "`n[1/1] Running unittest suite (tests/)..." -ForegroundColor Yellow
        python -m unittest discover -s tests -t . -v
    }

    "demo" {
        Write-Host "`n[1/3] Simulating TCP traffic across scenarios..." -ForegroundColor Yellow
        python simulate.py --outdir demo_data --duration 100 --sqlite demo_data/experiments.db

        Write-Host "`n[2/3] Training Random Forest classifier on simulated data..." -ForegroundColor Yellow
        python classifier.py train --synthetic --model models/rf.joblib --metrics models/rf_metrics.json

        Write-Host "`n[3/3] Generating performance graphs, error reports, and tables..." -ForegroundColor Yellow
        python analyze.py --input demo_data --out demo_data/figures --model models/rf.joblib --metrics models/rf_metrics.json --sqlite demo_data/experiments.db

        Write-Host "`n✅ Demo completed! Visualizations saved in: $ProjectPath\demo_data\figures" -ForegroundColor Green
    }

    "loopback" {
        Write-Host "`n[1/3] Starting background TCP server on 127.0.0.1:5201..." -ForegroundColor Yellow
        $serverJob = Start-Job -ScriptBlock {
            param($path)
            Set-Location $path
            python server.py --host 127.0.0.1 --port 5201 --outdir outputs
        } -ArgumentList $ProjectPath

        Start-Sleep -Seconds 2

        try {
            Write-Host "`n[2/3] Running TCP client session over loopback (20 Mbps cap)..." -ForegroundColor Yellow
            python client.py --host 127.0.0.1 --scenarios baseline,dynamic --duration 15 --rate-mbps 20 --sqlite outputs/experiments.db
        }
        finally {
            Write-Host "`nStopping server job..." -ForegroundColor DarkGray
            Stop-Job $serverJob -ErrorAction SilentlyContinue
            Remove-Job $serverJob -ErrorAction SilentlyContinue
        }

        Write-Host "`n[3/3] Analyzing recorded loopback session..." -ForegroundColor Yellow
        python analyze.py --input outputs --out outputs/figures --sqlite outputs/experiments.db

        Write-Host "`n✅ Loopback test completed! Results saved in: $ProjectPath\outputs\figures" -ForegroundColor Green
    }

    "web" {
        Write-Host "`nLaunching Frosted-Glass React Frontend (Vite)..." -ForegroundColor Yellow
        Set-Location "$ProjectPath\frontend"
        npm run dev -- --open
    }

    "serve" {
        Write-Host "`nServing production React build at http://localhost:3000..." -ForegroundColor Yellow
        Start-Process "http://localhost:3000"
        python -m http.server 3000 --directory "$ProjectPath\frontend\dist"
    }

    "dashboard" {
        Write-Host "`nLaunching Streamlit Dashboard..." -ForegroundColor Yellow
        python -m streamlit run dashboard.py
    }

    "clean" {
        Write-Host "`nCleaning temporary files and caches..." -ForegroundColor Yellow
        Get-ChildItem -Path . -Include __pycache__, .pytest_cache -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Cleaned caches." -ForegroundColor Green
    }

    default {
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        Write-Host "Available actions: web, serve, demo, loopback, test, dashboard, clean" -ForegroundColor Yellow
    }
}
