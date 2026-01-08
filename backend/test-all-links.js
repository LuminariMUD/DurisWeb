/**
 * Comprehensive test to validate all forum links and data for anonymous users
 */

const API_BASE = 'http://localhost:3001';

async function testEndpoint(name, url) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: ${name}`);
    console.log(`URL: ${url}`);
    console.log(`Status: ${response.status}`);

    if (response.ok) {
      console.log(`✅ SUCCESS`);
      console.log(`\nFull Response Data:`);
      console.log(JSON.stringify(data, null, 2));
      return { success: true, data };
    } else {
      console.log(`❌ FAILED`);
      console.log(`\nError Response:`);
      console.log(JSON.stringify(data, null, 2));
      return { success: false, data };
    }
  } catch (error) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: ${name}`);
    console.log(`URL: ${url}`);
    console.log(`❌ ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🧪 COMPREHENSIVE ANONYMOUS USER FORUM ACCESS TEST\n');
  console.log('Testing all forum endpoints with full data validation');
  console.log('='.repeat(70));

  let results = [];

  // Test 1: Auth check
  const authResult = await testEndpoint(
    'GET /api/auth/me',
    `${API_BASE}/api/auth/me`
  );
  results.push({ name: 'Auth Check', success: authResult.success });

  // Test 2: Categories
  const categoriesResult = await testEndpoint(
    'GET /api/forum/categories',
    `${API_BASE}/api/forum/categories`
  );
  results.push({ name: 'Categories', success: categoriesResult.success });

  // Test 3: Latest activity
  const latestResult = await testEndpoint(
    'GET /api/forum/activity/latest',
    `${API_BASE}/api/forum/activity/latest?limit=10`
  );
  results.push({ name: 'Latest Activity', success: latestResult.success });

  // Test 4: Popular threads
  const popularResult = await testEndpoint(
    'GET /api/forum/activity/popular',
    `${API_BASE}/api/forum/activity/popular?limit=10`
  );
  results.push({ name: 'Popular Threads', success: popularResult.success });

  // Test 5: Get first category's threads
  if (categoriesResult.success && categoriesResult.data.categories?.length > 0) {
    const firstCategory = categoriesResult.data.categories[0];
    const threadsResult = await testEndpoint(
      `GET /api/forum/categories/${firstCategory.id}/threads`,
      `${API_BASE}/api/forum/categories/${firstCategory.id}/threads?page=1&limit=10`
    );
    results.push({ name: 'Category Threads', success: threadsResult.success });

    // Test 6: Get first thread detail with posts
    if (threadsResult.success && threadsResult.data.threads?.length > 0) {
      const firstThread = threadsResult.data.threads[0];
      const threadDetailResult = await testEndpoint(
        `GET /api/forum/threads/${firstThread.id}`,
        `${API_BASE}/api/forum/threads/${firstThread.id}?page=1&limit=50`
      );
      results.push({ name: 'Thread Detail with Posts', success: threadDetailResult.success });

      // Validate that posts are actually returned
      if (threadDetailResult.success) {
        console.log(`\n${'='.repeat(70)}`);
        console.log('📋 VALIDATING THREAD DETAIL DATA STRUCTURE:');
        console.log(`Thread ID: ${threadDetailResult.data.thread?.id}`);
        console.log(`Thread Title: ${threadDetailResult.data.thread?.title}`);
        console.log(`Posts Array Exists: ${Array.isArray(threadDetailResult.data.posts)}`);
        console.log(`Number of Posts: ${threadDetailResult.data.posts?.length || 0}`);

        if (threadDetailResult.data.posts?.length > 0) {
          console.log(`\n✅ POSTS ARE RETURNED!`);
          console.log(`\nFirst Post Sample:`);
          console.log(JSON.stringify(threadDetailResult.data.posts[0], null, 2));
        } else {
          console.log(`\n❌ NO POSTS RETURNED - This is the problem!`);
        }
      }
    }
  }

  // Test 7: Try to access a specific known thread directly
  console.log(`\n${'='.repeat(70)}`);
  console.log('Testing direct thread access with known thread IDs...');

  for (let threadId of [1, 2, 3, 4, 5]) {
    const directThreadResult = await testEndpoint(
      `GET /api/forum/threads/${threadId}`,
      `${API_BASE}/api/forum/threads/${threadId}`
    );

    if (directThreadResult.success) {
      console.log(`\n✅ Thread ${threadId} accessible`);
      console.log(`   Posts count: ${directThreadResult.data.posts?.length || 0}`);
      if (directThreadResult.data.posts?.length > 0) {
        results.push({ name: `Thread ${threadId} with Posts`, success: true });
        break; // Found one with posts, that's enough
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('\n📊 FINAL SUMMARY:\n');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} ${r.name}`);
  });

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
