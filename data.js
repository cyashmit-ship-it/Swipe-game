// =====================================================================
//  GAME CONTENT AND SETTINGS
//  Every word players see is in this file. Change the text between the
//  quotation marks, keep the quotes, commas and brackets as they are.
//  {name}, {from}, {to}, {n}, {token} are filled in by the game: keep them.
// =====================================================================

const GAME = {
  // Results sheet link (Apps Script web app). Don't change unless you redeploy.
  scriptUrl: "https://script.google.com/macros/s/AKfycbzl2MKv2vZH6tWhssXQCWOPy9rTw88mmeg2slhx4xBrKA1Cdk824qc2TPlahnrvxJ8/exec",

  // Urban Illumina artwork. Put the files in the images/ folder and write
  // their names here, for example "images/illumina-logo.png". Leave "" for none.
  logo: "",
  background: "",

  // ---------------------------------------------------------------- start screen
  title: "Is It a Match?", // WORKING TITLE — to be decided
  intro: "Ten dishes are on the app tonight. Swipe right if you'd try them with a twist, left to keep them classic. Takes about a minute.",
  startHeading: "Create your profile",
  tokenLabel: "Token number",
  tokenHelp: "Numbers only, as on your slip. For example 7 or 07.",
  ageLabel: "Your age",
  genderLabel: "Gender",
  startButton: "Start swiping",
  // The three "how it works" lines on the start screen.
  howTo: [
    { icon: "yes", text: "Swipe right or tap Yes if you'd try the dish with a twist." },
    { icon: "no", text: "Swipe left or tap No to keep it the original way." },
    { icon: "crush", text: "Round 2: one Desi Crush for your favourite cuisine." },
  ],
  // Little stickers on the three cards on the start page (shown on hover or tap)
  fanStickers: [
    { stamp: "YES", line: "Chinese-style? Why not." },
    { stamp: "DESI CRUSH", line: "Korean, but make it desi." },
    { stamp: "NOPE", line: "Some classics stay classic." },
  ],

  // ---------------------------------------------------------------- rounds
  // flashSeconds: how long the full-screen round title stays up.
  rounds: {
    1: {
      emoji: "🥢",
      tag: "Round 1: Chinese twist",
      question: "Would you try this dish Chinese-style?",
      cardBanner: "Would you try it Chinese-style?",
      yesMeans: "Yes, I'd try the Chinese twist",
      noMeans: "No, keep it Indian",
      flashTitle: "Round 1",
      flashText: "Indian dishes with a Chinese twist.",
      flashSeconds: 1.5,
    },
    2: {
      emoji: "🌶️",
      tag: "Round 2: Desi twist",
      question: "Would you try this cuisine desi-style?",
      cardBanner: "Would you try it desi-style?",
      yesMeans: "Yes, give it an Indian twist",
      noMeans: "No, keep it original",
      crushMeans: "Desi Crush = your favourite (only one)",
      flashTitle: "Round 2",
      flashText: "World cuisines with a desi twist.",
      flashCrush: "You get one Desi Crush. Give it to your favourite.",
      flashSeconds: 2.5,
    },
  },

  // ---------------------------------------------------------------- buttons
  buttons: { no: "No", yes: "Yes", crush: "Desi Crush", undo: "Undo" },

  // ---------------------------------------------------------------- match screen (after Yes or Desi Crush)
  // After a Yes, the twist slides in and the screen moves on by itself after
  // minSeconds to maxSeconds (longer text = longer). A tap skips it.
  // The Desi Crush screen waits for Next. A No has no screen: the next card comes in.
  results: {
    match: "It's a match!",
    crush: "Desi crush!",
    desiName: "{name}, the desi way",
    teaserIntro: "On your first date, you might get:",
    minSeconds: 2,
    maxSeconds: 3.5,
    tapHint: "Tap anywhere to continue",
    next: "Next",
    last: "See my food profile",
    change: "Change my answer",
  },
  moveCrush: {
    title: "Move your Desi Crush?",
    text: "You gave it to {from}. Move it to {to}?",
    keep: "Keep it on {from}",
    move: "Move it",
  },

  // ---------------------------------------------------------------- full profile (the "See full profile" button)
  profileButton: "See full profile",
  profileBack: "Back to swiping",
  profileLabels: {
    spice: "Spice level",
    lookingFor: "Looking for",
    madeOf: "Made of",
    famousFor: "Famous for",
    greenFlag: "Green flag",
    redFlag: "Red flag",
    funFact: "Fun fact",
  },

  // ---------------------------------------------------------------- fortune cookie (switched off)
  // To bring it back, change show: false to show: true.
  // It then appears between round 1 and round 2.
  halftime: {
    show: false,
    title: "Halftime!",
    text: "5 down, 5 to go. Crack your fortune cookie.",
    crack: "Crack it",
    after: "Keep swiping",
  },
  fortunes: [
    "You will meet a samosa who changes your life.",
    "A spicy surprise is coming your way.",
    "Your next great love has extra cheese.",
    "Good things come to those who wait for the momos.",
    "Someone is thinking about sharing their fries with you.",
    "Today, the chutney is on your side.",
    "You will never run out of pav.",
    "A noodle in the hand is worth two in the bowl.",
  ],

  // ---------------------------------------------------------------- end screen
  done: {
    kicker: "Your food dating profile",
    statPart1: "Chinese twists you'd try",
    statPart2: "Cuisines you'd make desi",
    statCrush: "Desi crush",
    noCrush: "None",
    nextPlayer: "Next player",
    // A random dish from the 15 twists, just for fun (not saved to the sheet).
    matchKicker: "Your perfect match",
    matchLine: "{name} swiped right on you too.",
  },
  // Profile type, picked by the number of Yes + Desi Crush answers (out of 10).
  profiles: [
    { max: 2, name: "The Loyal Purist", line: "You love food exactly the way it was first made." },
    { max: 4, name: "The Picky Romantic", line: "You don't swipe right often, but when you do, you mean it." },
    { max: 6, name: "The Open-Minded Dater", line: "Half classic, half curious. A very balanced palate." },
    { max: 8, name: "The Fusion Flirt", line: "You look at a dish and wonder what it could become." },
    { max: 10, name: "The Food Adventurer", line: "No cuisine is safe from your curiosity." },
  ],

  // ---------------------------------------------------------------- messages
  messages: {
    welcomeBack: "Welcome back. Carrying on from dish {n} of 10.",
    undone: "Answer removed. Swipe again.",
    noToken: "Enter the token number from your slip.",
    badToken: "The token is a number only, like 7 or 15.",
    badAge: "Enter your age (5 to 99).",
    noGender: "Choose a gender option.",
    checking: "One moment…",
    offline: "Couldn't connect. Check the internet, then tap Start again.",
    used: "Token {token} has already played. Please check with the stall team.",
    inUse: "Token {token} is already playing on another device. Please check with the stall team.",
    restarted: "This game was restarted by the stall team. Enter the token again to start fresh.",
    exitTitle: "Leave this game?",
    exitText: "You can pick up where you left off with the same token.",
    exitStay: "Keep playing",
    exitLeave: "Leave game",
  },
};

// ---------------------------------------------------------------------
//  CARDS — played in this order: round 1 (part: 1), then round 2 (part: 2).
//  Don't change the id or part lines: the results sheet columns follow
//  this exact order (see apps-script/Code.gs).
//  Photos: file names are listed in images/README.md.
//  spice: 1 = mild, 2 = medium, 3 = hot.
//
//  Round 1: the card shows the original dish. After a Yes, the twist
//  (name, line, photo) slides in on the match screen.
//  Round 2: the card shows the cuisine. After a Yes, its two desi dishes
//  (desi: name + photo) show on the match screen.
// ---------------------------------------------------------------------

const CARDS = [
  // ================================================ ROUND 1: Chinese twist
  {
    id: "dosa",
    part: 1,
    name: "Masala Dosa",
    from: "Bengaluru",
    bio: "Crispy on the outside, soft potato heart inside.",
    chips: ["Crispy", "Breakfast hero", "Comes with sambar"],
    spice: 1,
    lookingFor: "Someone who appreciates a good crunch.",
    madeOf: "Rice and lentil batter, spiced potato, ghee.",
    greenFlag: "Always shows up with sambar and two chutneys.",
    redFlag: "Goes soggy if you leave me waiting.",
    funFact: "Some paper dosas are longer than the table they're served on.",
    photos: [{ src: "images/dosa.jpg", emoji: "🥞", caption: "Masala Dosa" }],
    twist: {
      name: "Schezwan Dosa",
      line: "The same crispy dosa, spread with fiery Schezwan sauce and stuffed with veg noodles.",
      photo: { src: "images/dosa-chinese.jpg", emoji: "🌶️", caption: "Schezwan Dosa" },
    },
  },
  {
    id: "samosa",
    part: 1,
    name: "Samosa",
    from: "Every chai stall in India",
    bio: "Triangle-shaped, tea-time famous, never been ghosted.",
    chips: ["Deep-fried", "Spiced potato", "Chai partner"],
    spice: 2,
    lookingFor: "A chai date at 5 pm sharp.",
    madeOf: "Crisp pastry, spiced potato and peas.",
    greenFlag: "Shows up at every party, no invite needed.",
    redFlag: "Leaves oil marks on your notes.",
    funFact: "The samosa travelled to India from Central Asia centuries ago.",
    photos: [{ src: "images/samosa.jpg", emoji: "🥟", caption: "Samosa" }],
    twist: {
      name: "Noodle Samosa",
      line: "A crispy samosa shell packed with chilli-garlic hakka noodles.",
      photo: { src: "images/samosa-chinese.jpg", emoji: "🍜", caption: "Noodle Samosa" },
    },
  },
  {
    id: "bhel",
    part: 1,
    name: "Bhel Puri",
    from: "Juhu Beach, Mumbai",
    bio: "Chatpata, crunchy and always the life of the party.",
    chips: ["Tangy", "Crunchy", "Street star"],
    spice: 2,
    lookingFor: "Someone spontaneous for a sunset walk.",
    madeOf: "Puffed rice, sev, onion, tamarind and mint chutney.",
    greenFlag: "Ready in two minutes, flat.",
    redFlag: "Goes soggy if you overthink it.",
    funFact: "Mumbai's beaches made bhel famous.",
    photos: [{ src: "images/bhel.jpg", emoji: "🥗", caption: "Bhel Puri" }],
    twist: {
      name: "Chinese Bhel",
      line: "Crispy fried noodles tossed with Schezwan sauce, cabbage and spring onion.",
      photo: { src: "images/bhel-chinese.jpg", emoji: "🥡", caption: "Chinese Bhel" },
    },
  },
  {
    id: "chaap",
    part: 1,
    name: "Soya Chaap",
    from: "Delhi",
    bio: "Delhi's favourite protein, straight off the tandoor.",
    chips: ["Smoky", "Protein-packed", "Tandoori"],
    spice: 2,
    lookingFor: "A gym buddy who loves a cheat meal.",
    madeOf: "Soya chunks, creamy marinade, tandoori masala.",
    greenFlag: "High protein, zero guilt.",
    redFlag: "Not actually meat. Sorry.",
    funFact: "Delhi has whole lanes lined with chaap stalls.",
    photos: [{ src: "images/chaap.jpg", emoji: "🍢", caption: "Soya Chaap" }],
    twist: {
      name: "Chilli Soya Chaap",
      line: "Tossed in a sticky chilli-garlic sauce with peppers and onions.",
      photo: { src: "images/chaap-chinese.jpg", emoji: "🌶️", caption: "Chilli Soya Chaap" },
    },
  },
  {
    id: "pavbhaji",
    part: 1,
    name: "Pav Bhaji",
    from: "Mumbai",
    bio: "Buttery, spicy and impossible to share.",
    chips: ["Buttery", "Spicy", "Comfort food"],
    spice: 2,
    lookingFor: "Someone who never says no to extra butter.",
    madeOf: "Mashed vegetable curry, butter, soft pav.",
    greenFlag: "Extra pav is always an option.",
    redFlag: "Butter content: classified.",
    funFact: "It began as a quick dinner for Mumbai's mill workers.",
    photos: [{ src: "images/pavbhaji.jpg", emoji: "🍛", caption: "Pav Bhaji" }],
    twist: {
      name: "Schezwan Pav Bhaji",
      line: "Bhaji with a Schezwan swirl, pav toasted in chilli-garlic butter.",
      photo: { src: "images/pavbhaji-chinese.jpg", emoji: "🔥", caption: "Schezwan Pav Bhaji" },
    },
  },

  // ================================================ ROUND 2: Desi twist
  {
    id: "korean",
    part: 2,
    name: "Korean",
    from: "Seoul",
    bio: "Bold, saucy and a little bit spicy. K-drama's favourite food.",
    chips: ["Sweet-spicy", "Saucy", "Trending"],
    spice: 3,
    lookingFor: "A K-drama binge partner.",
    famousFor: "Korean fried chicken, ramyeon, kimchi, bibimbap.",
    greenFlag: "Always brings free side dishes.",
    redFlag: "Kimchi breath.",
    funFact: "South Koreans eat more instant noodles per person than almost anyone.",
    photos: [{ src: "images/korean.jpg", emoji: "🍗", caption: "Korean fried chicken" }],
    desi: [
      { name: "Butter-chicken glazed Korean fried chicken", photo: { src: "images/korean-desi-1.jpg", emoji: "🍗", caption: "Butter-chicken glazed Korean fried chicken" } },
      { name: "Masala ramyeon with a jeera tadka", photo: { src: "images/korean-desi-2.jpg", emoji: "🍜", caption: "Masala ramyeon with a jeera tadka" } },
    ],
  },
  {
    id: "italian",
    part: 2,
    name: "Italian",
    from: "Rome",
    bio: "Carbs, cheese and a lot of olive oil.",
    chips: ["Cheesy", "Comforting", "Herby"],
    spice: 1,
    lookingFor: "Long dinners and longer conversations.",
    famousFor: "Pasta, pizza, risotto, tiramisu.",
    greenFlag: "Cheese on everything.",
    redFlag: "Will judge you for breaking spaghetti.",
    funFact: "Italy has hundreds of pasta shapes.",
    photos: [{ src: "images/italian.jpg", emoji: "🍝", caption: "Pasta in tomato-basil sauce" }],
    desi: [
      { name: "Makhani pasta", photo: { src: "images/italian-desi-1.jpg", emoji: "🍝", caption: "Makhani pasta" } },
      { name: "Achari paneer pizza", photo: { src: "images/italian-desi-2.jpg", emoji: "🍕", caption: "Achari paneer pizza" } },
    ],
  },
  {
    id: "thai",
    part: 2,
    name: "Thai",
    from: "Bangkok",
    bio: "Fragrant and fresh, balancing sweet, sour and spicy.",
    chips: ["Fragrant", "Coconut", "Zesty"],
    spice: 3,
    lookingFor: "Someone who can handle a little heat.",
    famousFor: "Green curry, pad thai, tom yum, mango sticky rice.",
    greenFlag: "Balances sweet, sour, salty and spicy.",
    redFlag: "'Medium spicy' is a lie.",
    funFact: "Thai green curry gets its colour from fresh green chillies.",
    photos: [{ src: "images/thai.jpg", emoji: "🍛", caption: "Thai green curry" }],
    desi: [
      { name: "Green curry with curry leaves, served with appam", photo: { src: "images/thai-desi-1.jpg", emoji: "🍛", caption: "Green curry with curry leaves, served with appam" } },
      { name: "Pad Thai chaat with imli chutney", photo: { src: "images/thai-desi-2.jpg", emoji: "🍜", caption: "Pad Thai chaat with imli chutney" } },
    ],
  },
  {
    id: "mexican",
    part: 2,
    name: "Mexican",
    from: "Mexico City",
    bio: "Big flavours, bigger fiestas.",
    chips: ["Spicy", "Zingy", "Handheld"],
    spice: 3,
    lookingFor: "A fiesta every weekend.",
    famousFor: "Tacos, burritos, nachos, guacamole.",
    greenFlag: "Always comes with lime and salsa.",
    redFlag: "Things get messy fast.",
    funFact: "Mexico grows dozens of different chilli varieties.",
    photos: [{ src: "images/mexican.jpg", emoji: "🌮", caption: "Tacos" }],
    desi: [
      { name: "Tandoori paneer tacos", photo: { src: "images/mexican-desi-1.jpg", emoji: "🌮", caption: "Tandoori paneer tacos" } },
      { name: "Rajma-chawal burrito", photo: { src: "images/mexican-desi-2.jpg", emoji: "🌯", caption: "Rajma-chawal burrito" } },
    ],
  },
  {
    id: "japanese",
    part: 2,
    name: "Japanese",
    from: "Tokyo",
    bio: "Precise, delicate and quietly confident.",
    chips: ["Delicate", "Umami", "Fresh"],
    spice: 1,
    lookingFor: "Someone calm with good chopstick skills.",
    famousFor: "Sushi, ramen, tempura, mochi.",
    greenFlag: "Beautifully presented, every time.",
    redFlag: "Wasabi ambush.",
    funFact: "Slurping your ramen is considered polite in Japan.",
    photos: [{ src: "images/japanese.jpg", emoji: "🍣", caption: "Sushi" }],
    desi: [
      { name: "Tandoori paneer sushi roll", photo: { src: "images/japanese-desi-1.jpg", emoji: "🍣", caption: "Tandoori paneer sushi roll" } },
      { name: "Rasam ramen", photo: { src: "images/japanese-desi-2.jpg", emoji: "🍜", caption: "Rasam ramen" } },
    ],
  },
];
