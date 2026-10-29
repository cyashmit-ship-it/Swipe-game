// PASTE YOUR GOOGLE WEB APP URL HERE
const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz6JQjMc_GD-wJwbAh_YbbvommCoD0olKzsBSFj64Et0t3oULUx8zQbhKvLS7euSnnF/exec";

// State Variables
let currentQuestionIndex = 0;
let userAnswers = [];
let userInfo = {};

// DOM Elements
const screenWelcome = document.getElementById('screen-welcome');
const screenQuestion = document.getElementById('screen-question');
const screenResult = document.getElementById('screen-result');
const screenEnd = document.getElementById('screen-end');

const welcomeForm = document.getElementById('welcome-form');
const btnTransform = document.getElementById('btn-transform');
const btnLetItBe = document.getElementById('btn-let-it-be');
const btnNext = document.getElementById('btn-next');

// 1. Handle Welcome Form Submission
welcomeForm.addEventListener('submit', function(e) {
    e.preventDefault();
    userInfo = {
        age: document.getElementById('user-age').value,
        gender: document.getElementById('user-gender').value,
        token: document.getElementById('user-token').value
    };
    switchScreen(screenWelcome, screenQuestion);
    loadQuestion();
});

// 2. Load Question Data into UI
function loadQuestion() {
    const currentData = surveyData[currentQuestionIndex];
    
    document.getElementById('dish-title').textContent = currentData.title;
    document.getElementById('dish-image').src = currentData.baseImage;
    btnTransform.textContent = currentData.actionText;
}

// 3. Handle User Choice
btnTransform.addEventListener('click', () => processChoice('transformed'));
btnLetItBe.addEventListener('click', () => processChoice('let_it_be'));

function processChoice(choiceType) {
    const currentData = surveyData[currentQuestionIndex];
    userAnswers.push(choiceType); // Store the response for Sheets

    // Setup Result Screen
    if (choiceType === 'transformed') {
        document.getElementById('result-image').src = currentData.transformedImage;
        document.getElementById('result-text').textContent = currentData.transformedText;
    } else {
        document.getElementById('result-image').src = currentData.baseImage; // Keep original image
        document.getElementById('result-text').textContent = currentData.letItBeText;
    }

    switchScreen(screenQuestion, screenResult);
}

// 4. Move to Next Question or Finish
btnNext.addEventListener('click', function() {
    currentQuestionIndex++;
    
    if (currentQuestionIndex < surveyData.length) {
        loadQuestion();
        switchScreen(screenResult, screenQuestion);
    } else {
        switchScreen(screenResult, screenEnd);
        submitToGoogleSheets();
    }
});

// 5. Submit all data to Google Sheets
async function submitToGoogleSheets() {
    const payload = {
        token: userInfo.token,
        age: userInfo.age,
        gender: userInfo.gender,
        answers: userAnswers
    };

    try {
        await fetch(GOOGLE_APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        // Hide spinner, show success
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('end-message').textContent = "Responses recorded successfully. You may close this tab.";
    } catch (error) {
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('end-message').textContent = "Error saving data. Please contact the administrator.";
        console.error("Submission error:", error);
    }
}

// Utility Function to switch UI screens
function switchScreen(hideElement, showElement) {
    hideElement.classList.remove('active');
    showElement.classList.add('active');
}
