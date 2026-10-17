; Bohpum - extra installer steps (electron-builder nsis.include): the File Explorer right-click menu
; "Convert to Bohpum (.bpum)". The app does the work (explorer-menu.js). Windows 11 shows one "allow changes"
; prompt to add the menu package; No / no admin / silent install -> classic menu. Updates keep the menu.
!macro customInstall
  DetailPrint "Adding Bohpum to the File Explorer right-click menu..."
  ${if} ${Silent}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install --silent'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install'
  ${endif}
!macroend

!macro customUnInstall
  ${if} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=release'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=uninstall'
  ${endif}
!macroend
