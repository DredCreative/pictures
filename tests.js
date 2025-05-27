// --- Test Framework (Simple) ---
const TestSuite = {
    tests: [],
    results: [],
    totalRun: 0,
    totalPassed: 0,

    addTest: function(name, fn) {
        this.tests.push({ name, fn });
    },

    run: async function() {
        this.results = [];
        this.totalRun = 0;
        this.totalPassed = 0;

        for (const test of this.tests) {
            this.totalRun++;
            let result = { name: test.name, status: "FAIL", error: "Unknown error" };
            try {
                await test.fn(); // Support async tests
                result.status = "PASS";
                result.error = null;
                this.totalPassed++;
            } catch (e) {
                result.status = "FAIL";
                result.error = e.stack ? e.stack : e.toString();
                console.error(`Test Failed: ${test.name}`, e);
            }
            this.results.push(result);
        }
        return this.results;
    },

    assertEquals: function(expected, actual, message = "Assertion Failed") {
        if (expected !== actual) {
            throw new Error(`${message}: Expected "${expected}" but got "${actual}"`);
        }
    },

    assertDeepEquals: function(expected, actual, message = "Deep Assertion Failed") {
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            throw new Error(`${message}: Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    },

    assertTrue: function(condition, message = "Assertion Failed") {
        if (!condition) {
            throw new Error(`${message}: Expected true but got false`);
        }
    },
    
    assertFalse: function(condition, message = "Assertion Failed") {
        if (condition) {
            throw new Error(`${message}: Expected false but got true`);
        }
    },

    assertNotNull: function(value, message = "Assertion Failed") {
        if (value === null || value === undefined) {
            throw new Error(`${message}: Expected not null but got ${value}`);
        }
    }
};

// --- Mocks ---
let mockLocalStorageStore = {};
const mockLocalStorage = {
    getItem: key => mockLocalStorageStore[key] || null,
    setItem: (key, value) => mockLocalStorageStore[key] = String(value),
    removeItem: key => delete mockLocalStorageStore[key],
    clear: () => mockLocalStorageStore = {}
};

let mockFetchResponses = {};
const mockFetch = async (url, options) => {
    if (mockFetchResponses[url]) {
        const res = mockFetchResponses[url];
        if (res.error) return Promise.reject(res.error); // Simulate network error
        return Promise.resolve({
            ok: res.ok,
            status: res.status,
            statusText: res.statusText || (res.ok ? "OK" : "Error"),
            json: () => Promise.resolve(res.jsonData || {}),
            text: () => Promise.resolve(res.textData || "")
        });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ message: "Not Found in Mock" }) });
};

let lastNotification = null;
const mockShowNotification = (message, type, duration, buttons) => {
    lastNotification = { message, type, duration, buttons };
    // If buttons for confirmAction, simulate a click for testing purposes
    if (type === 'confirm' && buttons && buttons.length > 0) {
        // This is a simplistic way; real tests might need more control over which button is "clicked"
        // For now, we'll assume the test will set up a way to trigger the confirm/cancel action.
    }
    console.log(`MockNotification: ${type} - ${message}`);
};

const mockShowLoadingIndicator = (message) => { console.log(`MockShowLoading: ${message}`); return { id: 'mock-loading' }; };
const mockHideLoadingIndicator = (indicator) => { console.log(`MockHideLoading: ${indicator.id}`); };

// Stubs for DOM elements if absolutely needed and can't be refactored out of function being tested
const mockManageGitHubImagesBtnContainer = { style: { display: 'none' } };


// --- Global setup for tests ---
let originalLocalStorage, originalFetch, originalShowNotification, originalShowLoading, originalHideLoading;
let originalGetElementById;

function setupMocks() {
    originalLocalStorage = window.localStorage;
    originalFetch = window.fetch;
    originalShowNotification = window.showNotification;
    originalShowLoading = window.showLoadingIndicator;
    originalHideLoading = window.hideLoadingIndicator;
    originalGetElementById = document.getElementById;

    window.localStorage = mockLocalStorage;
    window.fetch = mockFetch;
    window.showNotification = mockShowNotification;
    window.showLoadingIndicator = mockShowLoadingIndicator;
    window.hideLoadingIndicator = mockHideLoadingIndicator;
    
    document.getElementById = (id) => {
        if (id === 'manageGitHubImagesBtnContainer') return mockManageGitHubImagesBtnContainer;
        if (id === 'notification-container') return { insertBefore: () => {}, removeChild: () => {} }; // Basic stub
        // Add other specific element mocks if needed by functions under test
        return originalGetElementById.call(document, id);
    };
    
    mockLocalStorage.clear();
    mockFetchResponses = {}; // Clear fetch mocks for each test run if run multiple times
    githubConfig.owner = ''; // Reset global githubConfig
    githubConfig.repo = '';
    githubConfig.token = '';
    githubConfig.branch = 'main';
    githubConfig.imagesPath = 'images/';
    currentArticleIdForManagement = null;
    uploadedImages = new Map();
    processedContent = '';
}

function teardownMocks() {
    window.localStorage = originalLocalStorage;
    window.fetch = originalFetch;
    window.showNotification = originalShowNotification;
    window.showLoadingIndicator = originalShowLoading;
    window.hideLoadingIndicator = originalHideLoading;
    document.getElementById = originalGetElementById;
}


// --- Test Definitions ---

// GitHub Configuration and Validation
TestSuite.addTest("validateGitHubConfig - Success", async () => {
    githubConfig.owner = "testowner";
    githubConfig.repo = "testrepo";
    githubConfig.token = "testtoken";
    mockFetchResponses[`https://api.github.com/repos/testowner/testrepo`] = { ok: true, status: 200 };
    
    const isValid = await validateGitHubConfig();
    TestSuite.assertTrue(isValid, "Validation should return true on success");
    TestSuite.assertEquals("success", lastNotification.type, "Success notification type mismatch");
    TestSuite.assertEquals("inline-block", mockManageGitHubImagesBtnContainer.style.display, "Manage images button should be visible");
});

TestSuite.addTest("validateGitHubConfig - 401 Unauthorized", async () => {
    githubConfig.owner = "testowner";
    githubConfig.repo = "testrepo";
    githubConfig.token = "invalidtoken";
    mockFetchResponses[`https://api.github.com/repos/testowner/testrepo`] = { ok: false, status: 401 };

    const isValid = await validateGitHubConfig();
    TestSuite.assertFalse(isValid, "Validation should return false on 401");
    TestSuite.assertEquals("error", lastNotification.type, "Error notification type mismatch for 401");
    TestSuite.assertTrue(lastNotification.message.includes("Неверный токен"), "Error message content for 401");
    TestSuite.assertEquals("none", mockManageGitHubImagesBtnContainer.style.display, "Manage images button should be hidden on 401");
});

TestSuite.addTest("validateGitHubConfig - 404 Not Found", async () => {
    githubConfig.owner = "testowner";
    githubConfig.repo = "wrongrepo";
    githubConfig.token = "testtoken";
    mockFetchResponses[`https://api.github.com/repos/testowner/wrongrepo`] = { ok: false, status: 404 };

    const isValid = await validateGitHubConfig();
    TestSuite.assertFalse(isValid, "Validation should return false on 404");
    TestSuite.assertEquals("error", lastNotification.type);
    TestSuite.assertTrue(lastNotification.message.includes("Репозиторий не найден"));
    TestSuite.assertEquals("none", mockManageGitHubImagesBtnContainer.style.display);
});

TestSuite.addTest("validateGitHubConfig - Network Error", async () => {
    githubConfig.owner = "testowner";
    githubConfig.repo = "testrepo";
    githubConfig.token = "testtoken";
    mockFetchResponses[`https://api.github.com/repos/testowner/testrepo`] = { error: new TypeError("Network request failed") };

    const isValid = await validateGitHubConfig();
    TestSuite.assertFalse(isValid, "Validation should return false on network error");
    TestSuite.assertEquals("error", lastNotification.type);
    TestSuite.assertTrue(lastNotification.message.includes("сетевая ошибка"));
    TestSuite.assertEquals("none", mockManageGitHubImagesBtnContainer.style.display);
});

TestSuite.addTest("validateGitHubConfig - Missing Owner/Repo/Token", async () => {
    githubConfig.owner = ""; githubConfig.repo = ""; githubConfig.token = "";
    let isValid = await validateGitHubConfig();
    TestSuite.assertFalse(isValid, "Validation should fail if owner/repo missing");
    TestSuite.assertTrue(lastNotification.message.includes("Имя пользователя и репозиторий"));

    githubConfig.owner = "o"; githubConfig.repo = "r"; githubConfig.token = "";
    isValid = await validateGitHubConfig();
    TestSuite.assertFalse(isValid, "Validation should fail if token missing");
    TestSuite.assertTrue(lastNotification.message.includes("токен доступа GitHub не указан"));
});


// Image Management (GitHub)
TestSuite.addTest("saveImageInfo - Saves image data to localStorage", () => {
    const articleId = "testArticle123";
    saveImageInfo(articleId, "image1.jpg", "sha123", "http://example.com/image1.jpg");
    const storedImages = JSON.parse(mockLocalStorage.getItem(`article_${articleId}_images`));
    TestSuite.assertNotNull(storedImages);
    TestSuite.assertEquals(1, storedImages.length);
    TestSuite.assertEquals("image1.jpg", storedImages[0].filename);
    TestSuite.assertEquals("sha123", storedImages[0].sha);
});

TestSuite.addTest("deleteSingleImageFromGitHub - Success", async () => {
    const articleId = "articleWithImage";
    const filename = "pic.png";
    const sha = "abc";
    mockLocalStorage.setItem(`article_${articleId}_images`, JSON.stringify([{ filename, sha, url: "someurl" }]));
    githubConfig.owner = "user"; githubConfig.repo = "repo"; githubConfig.token = "token";
    
    mockFetchResponses[`https://api.github.com/repos/user/repo/contents/images/articleWithImage/pic.png`] = {
        ok: true, status: 200, jsonData: { commit: { sha: "commitSha" } }
    };

    await deleteSingleImageFromGitHub(articleId, filename, sha);
    const storedImages = JSON.parse(mockLocalStorage.getItem(`article_${articleId}_images`));
    TestSuite.assertEquals(0, storedImages.length, "Image should be removed from localStorage");
});

TestSuite.addTest("deleteSingleImageFromGitHub - API Error", async () => {
    const articleId = "articleWithError";
    const filename = "fail.jpg";
    const sha = "def";
    mockLocalStorage.setItem(`article_${articleId}_images`, JSON.stringify([{ filename, sha, url: "someurl" }]));
    githubConfig.owner = "user"; githubConfig.repo = "repo"; githubConfig.token = "token";

    mockFetchResponses[`https://api.github.com/repos/user/repo/contents/images/articleWithError/fail.jpg`] = {
        ok: false, status: 500, jsonData: { message: "Server Error" }
    };

    try {
        await deleteSingleImageFromGitHub(articleId, filename, sha);
        throw new Error("Should have failed"); // Force fail if no error thrown
    } catch (e) {
        TestSuite.assertTrue(e.message.includes("GitHub API: Server Error"), "Error message from API expected");
    }
    const storedImages = JSON.parse(mockLocalStorage.getItem(`article_${articleId}_images`));
    TestSuite.assertEquals(1, storedImages.length, "Image should still be in localStorage on API error");
});

TestSuite.addTest("deleteArticleImages - Deletes multiple images", async () => {
    const articleId = "articleMultiDelete";
    const images = [
        { filename: "img1.jpg", sha: "s1", url: "u1"},
        { filename: "img2.png", sha: "s2", url: "u2"}
    ];
    mockLocalStorage.setItem(`article_${articleId}_images`, JSON.stringify(images));
    githubConfig.owner = "u"; githubConfig.repo = "r"; githubConfig.token = "t";

    mockFetchResponses[`https://api.github.com/repos/u/r/contents/images/${articleId}/img1.jpg`] = { ok: true, status: 200 };
    mockFetchResponses[`https://api.github.com/repos/u/r/contents/images/${articleId}/img2.png`] = { ok: true, status: 200 };
    
    await deleteArticleImages(articleId);
    const storedImages = JSON.parse(mockLocalStorage.getItem(`article_${articleId}_images`));
    TestSuite.assertNull(storedImages, "localStorage entry for article images should be removed"); // Or an empty array, depending on implementation detail
    TestSuite.assertTrue(lastNotification.message.includes("Удалено 2 изображений"), "Success notification for multi-delete");
});


// Notifications and Confirmations
TestSuite.addTest("confirmAction - onConfirm callback executed", () => {
    let confirmCalled = false;
    const onConfirmCb = () => { confirmCalled = true; };
    
    confirmAction("Test confirm?", onConfirmCb);
    // Simulate clicking "Yes"
    TestSuite.assertNotNull(lastNotification.buttons, "Confirm notification should have buttons");
    lastNotification.buttons.find(b => b.className === 'confirm-yes').action();
    
    TestSuite.assertTrue(confirmCalled, "onConfirm callback should have been executed");
});

TestSuite.addTest("confirmAction - onCancel callback executed", () => {
    let cancelCalled = false;
    const onCancelCb = () => { cancelCalled = true; };
    
    confirmAction("Test cancel?", () => {}, onCancelCb);
    // Simulate clicking "Cancel"
    TestSuite.assertNotNull(lastNotification.buttons);
    lastNotification.buttons.find(b => b.className === 'confirm-cancel').action();
    
    TestSuite.assertTrue(cancelCalled, "onCancel callback should have been executed");
});


// generateArticleId
TestSuite.addTest("generateArticleId - Basic format", () => {
    // Mock querySelector for title generation part
    const originalQS = document.querySelector;
    document.querySelector = (selector) => {
        if (selector.startsWith('#previewContent')) return { textContent: "My Test Article" };
        return null;
    };
    
    const id = generateArticleId();
    TestSuite.assertTrue(id.startsWith("my-test-article-"), "ID should start with slugified title");
    TestSuite.assertTrue(id.length > "my-test-article-".length + 5, "ID should have a timestamp part");

    document.querySelector = originalQS; // Restore
});

// clearAll (Simplified test focusing on confirmAction)
TestSuite.addTest("clearAll - Calls confirmAction", () => {
    clearAll(); // This will show a confirm notification
    TestSuite.assertEquals("confirm", lastNotification.type, "clearAll should use confirm notification");
    TestSuite.assertTrue(lastNotification.message.includes("Вы уверены, что хотите все очистить?"), "clearAll confirmation message");
    // Further testing would require simulating the confirm click and checking cleared states
});


// Run all tests
async function runAllTests() {
    setupMocks();
    const results = await TestSuite.run();
    teardownMocks();
    return results;
}
console.log("tests.js loaded");
