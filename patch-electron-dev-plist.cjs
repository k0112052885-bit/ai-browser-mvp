const { existsSync } = require('fs')
const { execFileSync } = require('child_process')
const { join } = require('path')

const usageDescriptions = {
  NSBluetoothAlwaysUsageDescription:
    'AI 서비스 로그인, 패스키 인증, 보안 장치 확인 과정에서 Bluetooth 접근이 필요할 수 있습니다.',
  NSBluetoothPeripheralUsageDescription:
    'AI 서비스 로그인, 패스키 인증, 보안 장치 확인 과정에서 Bluetooth 접근이 필요할 수 있습니다.',
  NSCameraUsageDescription: 'AI 서비스의 카메라 입력 기능 사용 시 필요합니다.',
  NSMicrophoneUsageDescription: 'AI 서비스의 음성 입력 및 음성 대화 기능 사용 시 필요합니다.'
}

if (process.platform !== 'darwin') {
  process.exit(0)
}

const electronDist = join(__dirname, 'node_modules', 'electron', 'dist')
const plistPaths = [
  join(electronDist, 'Electron.app', 'Contents', 'Info.plist'),
  join(electronDist, 'Electron.app', 'Contents', 'Frameworks', 'Electron Helper.app', 'Contents', 'Info.plist'),
  join(electronDist, 'Electron.app', 'Contents', 'Frameworks', 'Electron Helper (GPU).app', 'Contents', 'Info.plist'),
  join(electronDist, 'Electron.app', 'Contents', 'Frameworks', 'Electron Helper (Plugin).app', 'Contents', 'Info.plist'),
  join(electronDist, 'Electron.app', 'Contents', 'Frameworks', 'Electron Helper (Renderer).app', 'Contents', 'Info.plist')
]

function setPlistValue(plistPath, key, value) {
  const plistBuddy = '/usr/libexec/PlistBuddy'

  try {
    execFileSync(plistBuddy, ['-c', `Set :${key} ${value}`, plistPath], { stdio: 'ignore' })
  } catch {
    execFileSync(plistBuddy, ['-c', `Add :${key} string ${value}`, plistPath], { stdio: 'ignore' })
  }
}

for (const plistPath of plistPaths) {
  if (!existsSync(plistPath)) continue

  for (const [key, value] of Object.entries(usageDescriptions)) {
    setPlistValue(plistPath, key, value)
  }

  console.log(`Patched macOS usage descriptions: ${plistPath}`)
}
