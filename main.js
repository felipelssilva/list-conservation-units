'use strict';

const fs = require('fs')
const jsdom = require("jsdom")
const { JSDOM } = jsdom
const https = require('https')
const { writeToPath } = require('@fast-csv/format');
const url = 'https://www.gov.br/icmbio/pt-br/assuntos/biodiversidade/unidade-de-conservacao/unidades-de-biomas'
const unitsData = './public/visited/unitsData.json'
const CUData = './public/visited/CUData.json'

let unitsUrl = []
let urlsVisited = []
let unitsInBiomes = []

/**
 * Fetch data
 * @param {string} url 
 * @returns data
 */
const fetch = async function (url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 600 * 1000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        return reject(new Error(`HTTP status code ${res.statusCode}`))
      }

      const body = []
      res.on('data', (chunk) => body.push(chunk))
      res.on('end', () => {
        const resString = Buffer.concat(body).toString()
        resolve(resString)
      })
    })

    request.on('error', (err) => {
      reject(err)
    })

    request.on('timeout', () => {
      request.destroy()
      reject(new Error('timed out'))
    })
  })
}

/**
 * Begin the extraction
 */
const start = async function () {
  let fileUnitsData = getFile(unitsData)
  let fileCUData = getFile(CUData)

  if (!fileUnitsData && !fileCUData) {
    await fetch(url)
      .then((response) => getCusOnBiomes(response))
      .then(() => getAllUnitsByBiomes())
      .then(async () => await loadUnitsInBiomes())
      .catch(error => {
        customLog(error, url)
      })
  } else {
    fs.readFile(CUData, (err, data) => {
      if (err) throw err;
      let cusData = JSON.parse(data);

      cusData.forEach(async (cu) => {
        await fetch(cu.url)
          .then((response) => {
            let dom = new JSDOM(response)

            let divEmail = dom.window.document.createElement("div")
            divEmail.innerHTML = getEmailInfos(dom.window.document.getElementsByTagName("p"))
            let textContentEmail = divEmail.textContent || divEmail.innerText || ""
            let textExtractEmails = extractEmails(textContentEmail)
            
            urlsVisited.push({
              name: dom.window.document.getElementsByClassName("outstanding-title")[0].textContent.trim(),
              url: cu.url,
              visited: true,
              hasManagementPlan: !!getItemByElementsTagName(dom.window.document.getElementsByTagName("h3"), "PLANO DE MANEJO"),
              email: textExtractEmails
            })

          })
          .then(() => {
            const data = urlsVisited;
            const options = { headers: true, quoteColumns: true };
            let date = new Date().toISOString();

            writeToPath(`./public/visited/dataUrls.csv`, data, options)
              .on('error', err => console.error(err))
              .on('finish', () => console.log(`Done writing ${date}.`));

            fs.writeFileSync(`./public/visited/dataUrls.json`, JSON.stringify(data));
          })
          .catch(error => {
            customLog(error, url)
          })
      })
    });

  }
}

/**
 * Extract only email of a big string
 * @param {string} text 
 * @returns matched text
 */
function extractEmails(text) {
  return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
}

/**
 * Get the name and url of Conservation Units On Biomes
 */
function getCusOnBiomes(response) {
  let dom = new JSDOM(response)
  var links = dom.window.document.querySelectorAll('a.govbr-card-content')

  links.forEach((link) => {
    unitsUrl.push({
      name: link.textContent.trim(),
      url: link.href
    })
  })
  fs.writeFileSync(unitsData, JSON.stringify(unitsUrl));
}

/**
 * Get all units by the biomes
 */
function getAllUnitsByBiomes() {
  unitsUrl.forEach(async (unit) => {
    await fetch(unit.url + '/lista-de-ucs')
      .then((response) => {
        let dom = new JSDOM(response)
        let cuPages = dom.window.document.querySelectorAll('ul.paginacao li a');

        cuPages.forEach(async (cuPage, index) => {
          fetchUnitsInCUData(cuPage.href.split("?")[0] + getPages()[index][index], unit, index)

          if (cuPage.href.indexOf('mata-atlantica') > 0 && index == 7) {
            fetchUnitsInCUData(cuPage.href.split("?")[0] + getPages()[8][8], unit, 8)
          }
        })

      })
      .catch(error => {
        customLog(error, url)
      })
  })
}

/**
 * Load the json of all units in all biomes
 */
async function loadUnitsInBiomes() {
  fs.readFile('./public/visited/unitsInBiomes.json', (err, data) => {
    if (err) throw err;
    let unitsInBiomes = JSON.parse(data);
    unitsInBiomes.forEach(uc => {
      //console.log(uc)
    });
  });
}

/**
 * Fetch data the units in biomes 
 * @param {string} url url of the iteration
 * @param {object} unit unit of the iteration
 * @param {int} index index of loop
 */
async function fetchUnitsInCUData(url, unit, index) {
  await fetch(url)
    .then((response) => {
      let dom = new JSDOM(response)
      // cus - Convervation Unit's
      var cus = dom.window.document.querySelectorAll("#content-core .summary.url")

      cus.forEach((cu) => {
        unitsInBiomes.push({
          name: cu.textContent.trim(),
          url: cu.href,
          biome: unit.name,
          page: index
        })
      })

    })
    .then(() => {
      fs.writeFileSync(CUData, JSON.stringify(unitsInBiomes));
    })
    .catch(error => {
      customLog(error, url)
    })
}

/**
 * Get the info of pagination
 * @returns object
 */
function getPages() {
  return [
    { 0: '?b_start:int=0' },
    { 1: '?b_start:int=20' },
    { 2: '?b_start:int=40' },
    { 3: '?b_start:int=60' },
    { 4: '?b_start:int=80' },
    { 5: '?b_start:int=100' },
    { 6: '?b_start:int=120' },
    { 7: '?b_start:int=140' },
    { 8: '?b_start:int=160' },
    { 9: '?b_start:int=180' },
    { 10: '?b_start:int=200' },
  ]
}

function getEmailInfos(item) {
  for (var i = 0; i < item.length; i++) {
    if (item[i].innerHTML.indexOf("@") != -1) {
      return item[i].innerHTML
    }
  }
}

function getItemByElementsTagName(tag, name) {
  for (var i = 0; i < tag.length; i++) {
    if (tag[i].innerHTML.indexOf(name) != -1) {
      return true;
    }
  }
}

/**
 * Custom logger
 * @param {string} param content of custom log
 * @param {string} text title of custom log
 */
function customLog(content, title) {
  console.log('--------------------------------------------------------------------------------')
  console.log(title)
  console.log('--------------------------------------------------------------------------------')
  console.log(content)
  console.log('--------------------------------------------------------------------------------')
}

/**
 * Test the existence of file
 * @param {string} file string of file url
 * @returns boolean if file exists
 */
function getFile(file) {
  try {
    return !!fs.existsSync(file);
  } catch (err) {
    return false
  }
}

// Init the extraction
start();