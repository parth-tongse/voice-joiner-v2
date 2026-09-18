@echo off
title Push Project to GitHub
echo ====================================================
echo Pushing VC Joiner v2 to GitHub Repository
echo Repo: https://github.com/parth-tongse/VC-joiner-1.0v.git
echo ====================================================
cd /d "%~dp0"
git init
git remote remove origin 2>nul
git remote add origin https://github.com/parth-tongse/VC-joiner-1.0v.git
git add .
git commit -m "Complete project setup with Vercel and Lavalink configuration"
git branch -M main
git push -u origin main
echo ====================================================
echo Done! All files pushed to GitHub successfully.
echo ====================================================
pause
