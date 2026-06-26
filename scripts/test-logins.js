require('dotenv').config({ path: '.env' })
const https = require('https')
const http = require('http')

const BASE_URL = 'https://civiltracker.buildogram.in'

const TESTS = [
  { name: 'Super Admin', email: 'admin@civiltracker.in', password: 'Admin@123456', expectedRedirect: '/super-admin/dashboard' },
  { name: 'Company Admin', email: 'arun@madras-crafters.in', password: 'Admin@123456', expectedRedirect: '/dashboard' },
  { name: 'Site Engineer', email: 'murugan@madras-crafters.in', password: 'Admin@123456', expectedRedirect: '/mobile/home' },
]

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.request(url, { ...options, timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function testLogin(test) {
  console.log(`\n=== Testing: ${test.name} ===`)
  
  // Step 1: Get CSRF token
  const csrfRes = await fetchUrl(`${BASE_URL}/api/auth/csrf`)
  if (csrfRes.status !== 200) {
    console.log(`❌ CSRF endpoint failed: ${csrfRes.status}`)
    return
  }
  const csrfData = JSON.parse(csrfRes.body)
  const csrfToken = csrfData.csrfToken
  const cookies = csrfRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || ''
  console.log(`✅ CSRF token obtained (${csrfToken?.substring(0, 12)}...)`)
  console.log(`✅ Cookies: ${cookies.substring(0, 60)}...`)

  // Step 2: Sign in
  const body = `csrfToken=${csrfToken}&email=${encodeURIComponent(test.email)}&password=${encodeURIComponent(test.password)}&redirect=false&json=true&callbackUrl=%2F`
  const signInRes = await fetchUrl(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'Cookie': cookies,
    },
    body,
  })
  
  console.log(`Sign-in response: ${signInRes.status}`)
  
  if (signInRes.status === 302 || signInRes.status === 200) {
    const location = signInRes.headers['location'] || ''
    const sessionCookie = signInRes.headers['set-cookie']?.find(c => c.includes('session-token') || c.includes('next-auth'))
    const allCookies = [cookies, ...(signInRes.headers['set-cookie']?.map(c => c.split(';')[0]) || [])].join('; ')
    
    console.log(`  Redirect to: ${location}`)
    if (location.includes('error')) {
      console.log(`❌ AUTH FAILED: ${location}`)
      return
    }
    
    console.log(`✅ Sign-in succeeded`)
    if (sessionCookie) console.log(`✅ Session cookie set`)

    // Step 3: Check the homepage (/) for redirect
    const homeRes = await fetchUrl(`${BASE_URL}/`, {
      headers: { 'Cookie': allCookies },
      method: 'GET',
    })
    console.log(`  / status: ${homeRes.status}, redirect: ${homeRes.headers['location'] || 'none'}`)

    // Step 4: Test the expected dashboard directly
    const dashRes = await fetchUrl(`${BASE_URL}${test.expectedRedirect}`, {
      headers: { 'Cookie': allCookies },
      method: 'GET',
    })
    console.log(`  ${test.expectedRedirect} status: ${dashRes.status}`)
    
    if (dashRes.status === 200) {
      const hasError = dashRes.body.includes('Application error') || dashRes.body.includes('500') || dashRes.body.includes('Internal Server Error')
      if (hasError) {
        console.log(`❌ Dashboard loaded but has errors`)
        console.log(dashRes.body.substring(0, 300))
      } else {
        console.log(`✅ Dashboard loads cleanly`)
      }
    } else {
      console.log(`❌ Dashboard returned ${dashRes.status}`)
    }
  } else {
    console.log(`❌ Sign-in failed with status: ${signInRes.status}`)
    console.log(signInRes.body.substring(0, 300))
  }
}

async function testPublicEndpoints() {
  console.log('\n=== Public Endpoints ===')
  const endpoints = [
    '/api/health',
    '/login',
  ]
  for (const ep of endpoints) {
    const res = await fetchUrl(`${BASE_URL}${ep}`)
    console.log(`  ${ep}: ${res.status} ${res.status === 200 ? '✅' : '❌'}`)
  }
}

async function main() {
  console.log(`Testing: ${BASE_URL}\n`)
  await testPublicEndpoints()
  for (const test of TESTS) {
    try {
      await testLogin(test)
    } catch (e) {
      console.log(`❌ Error: ${e.message}`)
    }
  }
  console.log('\n=== Done ===')
}

main()
