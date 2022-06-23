const api = require('./sf_api')
const fsUtils = require('./fs_utils')
const fs = require('fs');

const RECONCILIATOIN_FIELDS_TO_SYNC = ["name_nl", "name_fr", "name_en", "auto_hide_formula", "text_configuration", "virtual_account_number", "reconciliation_type", "public", "allow_duplicate_reconciliations", "is_active", "tests"]

createNewTemplateFolder = async function (handle) {
  const relativePath = `./${handle}`

  fsUtils.createFolders(relativePath)
  testFile = { name: "test", content: "" }
  textParts = { "part_1": "" }
  text = ""
  fsUtils.createFiles({ relativePath, testFile, textParts, text })

  config = {
    "text": "text.liquid",
    "text_parts": {
      "part_1": "text_parts/part_1.liquid"
    },
    "test": "tests/test.yml",
    "name_en": ""
  }
  writeConfig(relativePath, config)
}

importNewTemplateFolder = async function (handle) {
  reconciliationText = await api.findReconciliationText(handle)
  if (!reconciliationText) {
    throw(`${handle} wasn't found`)
  }

  const relativePath = `./${handle}`
  fsUtils.createFolders(relativePath)
  testFile = { name: "test", content: reconciliationText.tests }
  textPartsReducer = (acc, part) => {
    acc[part.name] = part.content
    return acc
  }


  textParts = reconciliationText.text_parts.reduce(textPartsReducer, {})
  fsUtils.createFiles({ relativePath, testFile, textParts, text: reconciliationText.text })

  attributes = RECONCILIATOIN_FIELDS_TO_SYNC.reduce((acc, attribute) => {
    acc[attribute] = reconciliationText[attribute]
    return acc
  }, {})

  configTextParts = Object.keys(textParts).reduce((acc, name) => {
    if (name) {
      acc[name] = `text_parts/${name}.liquid`
    }

    return acc
  }, {})

  config = {
    ...attributes,
    "text": "text.liquid",
    "text_parts": configTextParts,
    "test": "tests/test.yml",
  }
  writeConfig(relativePath, config)
}

constructReconciliationText = function (handle) {
  const relativePath = `./${handle}`
  const config = fsUtils.readConfig(relativePath)

  const attributes = RECONCILIATOIN_FIELDS_TO_SYNC.reduce((acc, attribute) => {
    acc[attribute] = config[attribute]
    return acc
  }, {})
  attributes.text = fs.readFileSync(`${relativePath}/text.liquid`, 'utf-8')
  attributes.tests = fs.readFileSync(`${relativePath}/tests/test.yml`, 'utf-8')

  const textParts = Object.keys(config.text_parts).reduce((array, name) => {
    let path = `${relativePath}/${config.text_parts[name]}`
    let content = fs.readFileSync(path, 'utf-8')

    array.push({ name, content })
    return array
  }, [])

  attributes.text_parts = textParts

  const mainPartPath = `${relativePath}/${config.text}`
  const mainPartContent = fs.readFileSync(mainPartPath, 'utf-8')
  attributes.text = mainPartContent
  
  return attributes
}

persistReconciliationText = async function (handle) {
  reconciliationText = await api.findReconciliationText(handle)

  if (reconciliationText) {
    api.updateReconciliationText(reconciliationText.id, {...constructReconciliationText(handle), "version_comment": "Testing Cli"})
  } else {
    throw("Creation of reconcilaition texts isn't yet support by API")
  }
}

runTests = async function (handle) {
  const relativePath = `./${handle}`
  const config = fsUtils.readConfig(relativePath)
  const testPath = `${relativePath}/${config.test}`
  const testContent = fs.readFileSync(testPath, 'utf-8')

  const testParams = { 'template': constructReconciliationText(handle), 'tests': testContent }

  const testRunResponse = await api.createTestRun(testParams)
  const testRunId = testRunResponse.data
  let testRun = { 'status': 'started' }
  const pollingDelay = 2000

  while (testRun.status === 'started') {
    await new Promise(resolve => setTimeout(resolve, pollingDelay))

    const response = await api.fetchTestRun(testRunId)
    testRun = response.data
  }

  if (testRun.status !== 'completed') {
    console.error(testRun.error_message)
    process.exit(1)
  }

  if (testRun.result.length !== 0) {
    console.error('Tests Failed')
    console.error(testRun.result)
    process.exit(1)
  }
}
module.exports = { createNewTemplateFolder, importNewTemplateFolder, constructReconciliationText, persistReconciliationText, runTests }
