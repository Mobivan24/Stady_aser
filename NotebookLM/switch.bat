@echo off
set USER_HOME=C:\Users\user
echo Current Profile: media
if exist %USER_HOME%\.notebooklm (
    move %USER_HOME%\.notebooklm %USER_HOME%\.notebooklm_media
    move %USER_HOME%\.notebooklm-mcp %USER_HOME%\.notebooklm-mcp_media
    move %USER_HOME%\.notebooklm_default %USER_HOME%\.notebooklm
    move %USER_HOME%\.notebooklm-mcp_default %USER_HOME%\.notebooklm-mcp
    echo default > %USER_HOME%\.notebooklm\current_profile.txt
    echo Profile switched to default
) else (
    echo .notebooklm directory not found
)
