@echo off
rem Пересобирает нативный модуль pcsclite вручную.
rem Нужен, если "npm install"/"npm rebuild" не может собрать pcsclite из-за
rem того, что встроенный в npm node-gyp не распознаёт установленную версию
rem Visual Studio Build Tools (например, VS Build Tools 2026 / v18.x) —
rem npm-овский node-gyp пока умеет только VS2017/2019/2022. Этот скрипт
rem запускает актуальный node-gyp через npx внутри окружения VS Developer
rem Command Prompt, где компилятор уже виден по PATH/INCLUDE/LIB.

call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 (
  echo Не найден vcvarsall.bat по указанному пути — проверьте путь установки VS Build Tools.
  exit /b 1
)

cd /d "%~dp0node_modules\pcsclite"
npx --yes node-gyp@latest rebuild
