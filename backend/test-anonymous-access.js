/**
 * Test script to verify anonymous users can access public forum content
 */

const API_BASE = 'http://localhost:3001';

async function testEndpoint(name, url) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${name}: SUCCESS (${response.status})`);
      console.log(`   Data:`, JSON.stringify(data).substring(0, 100) + '...');
      return true;
    } else {
      console.log(`❌ ${name}: FAILED (${response.status})`);
      console.log(`   Error:`, data);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n🧪 Testing Anonymous User Access\n');
  console.log('='.repeat(50));

  const tests = [
    ['GET /api/auth/me', `${API_BASE}/api/auth/me`],
    ['GET /api/forum/categories', `${API_BASE}/api/forum/categories`],
    ['GET /api/forum/activity/latest', `${API_BASE}/api/forum/activity/latest?limit=5`],
    ['GET /api/forum/activity/popular', `${API_BASE}/api/forum/activity/popular?limit=5`],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, url] of tests) {
    const result = await testEndpoint(name, url);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
