const fs = require('fs')
const path = require('path')

function saveRecognitionResult(elements) {
  const resultPath = path.join(__dirname, '..', 'uploads', 'recognition-result.json')
  fs.writeFileSync(resultPath, JSON.stringify(elements, null, 2))
  console.log('识别结果已保存到:', resultPath)
}

console.log('使用示例:')
console.log(`
saveRecognitionResult([
  { id: 'left-panel', x: 0, y: 0, width: 0.145, height: 1 },
  { id: 'right-panel', x: 0.855, y: 0, width: 0.145, height: 1 }
])
`)

module.exports = { saveRecognitionResult }
