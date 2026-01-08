/**
 * Test script to verify forum permissions for anonymous and authenticated users
 */

const API_BASE = 'http://localhost:3001';

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${name}: SUCCESS (${response.status})`);
      console.log(`   Data preview:`, JSON.stringify(data).substring(0, 150) + '...');
      return { success: true, data };
    } else {
      console.log(`❌ ${name}: FAILED (${response.status})`);
      console.log(`   Error:`, data);
      return { success: false, data };
    }
  } catch (error) {
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testAnonymousAccess() {
  console.log('\n🔓 Testing Anonymous User Access\n');
  console.log('='.repeat(60));

  const tests = [
    ['GET /api/auth/me (should return null)', `${API_BASE}/api/auth/me`],
    ['GET /api/forum/categories', `${API_BASE}/api/forum/categories`],
    ['GET /api/forum/activity/latest', `${API_BASE}/api/forum/activity/latest?limit=5`],
    ['GET /api/forum/activity/popular', `${API_BASE}/api/forum/activity/popular?limit=5`],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, url] of tests) {
    const result = await testEndpoint(name, url);
    if (result.success) {
      passed++;
    } else {
      failed++;
    }
    console.log('');
  }

  // Get a thread ID from latest activity to test thread detail view
  console.log('📝 Getting thread ID for detail test...\n');
  const latestResult = await testEndpoint(
    'GET /api/forum/activity/latest (for thread ID)',
    `${API_BASE}/api/forum/activity/latest?limit=1`
  );

  if (latestResult.success && latestResult.data.length > 0) {
    const threadId = latestResult.data[0].id;
    console.log(`   Found thread ID: ${threadId}\n`);

    const threadResult = await testEndpoint(
      `GET /api/forum/threads/${threadId} (thread detail)`,
      `${API_BASE}/api/forum/threads/${threadId}`
    );

    if (threadResult.success) {
      passed++;
      console.log('   ✅ Can view thread posts as anonymous user');
    } else {
      failed++;
      console.log('   ❌ Cannot view thread posts as anonymous user');
    }
    console.log('');
  } else {
    console.log('   ⚠️  No threads available to test\n');
  }

  // Test that anonymous users CANNOT create posts
  console.log('🚫 Testing Anonymous Write Restrictions\n');

  const writeTests = [
    ['POST /api/forum/threads (should fail)', `${API_BASE}/api/forum/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: 1,
        title: 'Test Thread',
        content: 'Test content'
      })
    }],
    ['POST /api/forum/posts (should fail)', `${API_BASE}/api/forum/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: 1,
        content: 'Test post'
      })
    }],
  ];

  for (const [name, url, options] of writeTests) {
    const result = await testEndpoint(name, url, options);
    // For write operations, we WANT them to fail for anonymous users
    const errorText = JSON.stringify(result.data);
    if (!result.success && (errorText.includes('authenticated') || errorText.includes('Not authenticated'))) {
      console.log('   ✅ Correctly denied (not authenticated)');
      passed++;
    } else if (result.success) {
      console.log('   ❌ SECURITY ISSUE: Anonymous user can write!');
      failed++;
    } else {
      console.log('   ⚠️  Failed but with unexpected error');
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`\n📊 Anonymous Access Results: ${passed} passed, ${failed} failed\n`);

  return { passed, failed };
}

async function testAuthenticatedAccess() {
  console.log('\n🔐 Testing Authenticated User Access\n');
  console.log('='.repeat(60));
  console.log('⚠️  Note: This test requires valid authentication cookies');
  console.log('    Run this in a browser console with active session\n');
  console.log('='.repeat(60));
  console.log('\nSkipping authenticated tests (requires browser session)\n');

  return { passed: 0, failed: 0 };
}

async function runTests() {
  console.log('\n🧪 Forum Permissions Test Suite\n');
  console.log('Testing Forum Access Control and Permissions');
  console.log('='.repeat(60));

  const anonymousResults = await testAnonymousAccess();
  const authenticatedResults = await testAuthenticatedAccess();

  const totalPassed = anonymousResults.passed + authenticatedResults.passed;
  const totalFailed = anonymousResults.failed + authenticatedResults.failed;

  console.log('='.repeat(60));
  console.log(`\n📊 FINAL RESULTS: ${totalPassed} passed, ${totalFailed} failed\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

runTests();
