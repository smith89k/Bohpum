; Bohpum - extra installer steps (electron-builder nsis.include).
; 1) The File Explorer right-click menu "Convert to Bohpum (.bpum)". The app does the work (explorer-menu.js).
;    Windows 11 shows one "allow changes" prompt to add the menu package; No / no admin / silent -> classic menu.
; 2) .pub files: Bohpum is added to "Open with" but never made the default, so Microsoft Publisher keeps .pub.
;    (.bpum is registered by electron-builder from package.json fileAssociations: Bohpum opens it, own icon.)
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Bohpum.PubFile" "" "Microsoft Publisher file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Bohpum.PubFile\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Bohpum.PubFile\shell\open" "" "Open with Bohpum"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Bohpum.PubFile\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.pub\OpenWithProgids" "Bohpum.PubFile" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pub" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".bpum" ""
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'

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
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Bohpum.PubFile"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.pub\OpenWithProgids" "Bohpum.PubFile"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  ${endif}
!macroend
