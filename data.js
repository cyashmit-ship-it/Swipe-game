// =====================================================================
//  GAME CONTENT AND SETTINGS
//  Every word players see is in this file. Change the text between the
//  quotation marks, keep the quotes, commas and brackets as they are.
// =====================================================================

const GAME = {
  // Results sheet link (Apps Script web app). Don't change unless you redeploy.
  scriptUrl: "https://script.google.com/macros/s/AKfycbzl2MKv2vZH6tWhssXQCWOPy9rTw88mmeg2slhx4xBrKA1Cdk824qc2TPlahnrvxJ8/exec",

  // Urban Illumina artwork. Put the files in the images/ folder and write
  // their names here, for example "images/illumina-logo.png". Leave "" for none.
  logo: "",
  background: "",

  // ---------------------------------------------------------------- start
  title: "Is It a Match?", // WORKING TITLE — to be decided
  intro:
    "Ten dishes are on the app tonight. Some want a twist, some want to stay exactly as they are. " +
    "Swipe right if you'd try the twist. Swipe left if you'd keep it classic.",
  startHeading: "Create your profile",
  tokenLabel: "Token number",
  tokenHelp: "It's on your slip.",
  ageLabel: "Your age",
  genderLabel: "Gender",
  startButton: "Start swiping",
  // Little stickers on the three cards on the start page (shown on hover or tap)
  fanStickers: [
    { stamp: "YES", line: "Chinese-style? Why not." },
    { stamp: "DESI CRUSH", line: "Korean, but make it desi." },
    { stamp: "NOPE", line: "Some classics stay classic." },
  ],

  // ---------------------------------------------------------------- how to play
  howTo: {
    title: "How it works",
    steps: [
      { icon: "yes", text: "Swipe right or tap Yes if you'd try the dish with a twist." },
      { icon: "no", text: "Swipe left or tap No to keep it the original way." },
      { icon: "crush", text: "In the world-cuisine round you get one Desi Crush. Give it to the cuisine you'd most love made desi. You can move it later." },
    ],
    example: "We're not asking if you like samosa. We're asking if you'd try a Chinese-style samosa.",
    button: "Got it, let's swipe",
  },

  // ---------------------------------------------------------------- rounds
  rounds: {
    1: {
      emoji: "🥢",
      tag: "Chinese twist round",
      question: "Would you try this dish Chinese-style?",
      cardBanner: "Would you try it Chinese-style?",
      yesMeans: "Yes, I'd try the Chinese twist",
      noMeans: "No, keep it Indian",
      flashTitle: "Chinese twist round",
      flashText: "Indian dishes, made Chinese-style.",
    },
    2: {
      emoji: "🌶️",
      tag: "Desi twist round",
      question: "Would you try this cuisine desi-style?",
      cardBanner: "Would you try it desi-style?",
      yesMeans: "Yes, give it an Indian twist",
      noMeans: "No, keep it original",
      crushMeans: "Desi Crush = your favourite (only one)",
      flashTitle: "Desi twist round",
      flashText: "World cuisines, made Indian.",
    },
  },

  // Shown once, before the first world-cuisine card.
  plotTwist: {
    title: "Plot twist!",
    text: "Now cuisines from around the world are on the app. Would you try them with an Indian twist?",
    crushNote: "You have one Desi Crush. Give it to the cuisine you'd love most made desi.",
    button: "Show me",
  },

  // ---------------------------------------------------------------- buttons and results
  buttons: { no: "No", yes: "Yes", crush: "Desi Crush", undo: "Undo" },
  results: {
    match: "It's a match!",
    crush: "Desi crush!",
    classic: "Keeping it classic",
    authentic: "Keeping it authentic",
    desiName: "{name}, the desi way", // {name} becomes the cuisine name
    teaserIntro: "On your first date, you might get:",
    next: "Next",
    last: "See my food profile",
    change: "Change my answer",
    tapHint: "Tap anywhere to continue",
  },
  moveCrush: {
    title: "Move your Desi Crush?",
    text: "You gave it to {from}. Move it to {to}?", // {from} and {to} become cuisine names
    keep: "Keep it on {from}",
    move: "Move it",
  },
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

  // ---------------------------------------------------------------- halftime surprise (after dish 5)
  halftime: {
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
    badToken: "Tokens use letters and numbers only.",
    badAge: "Enter your age (5 to 99).",
    noGender: "Choose a gender option.",
    checking: "One moment…",
    offline: "Couldn't connect. Check the internet, then tap Start again.",
    used: "Token {token} has already played. Please check with the stall team.",
    restarted: "This game was restarted by the stall team. Enter the token again to start fresh.",
    exitTitle: "Leave this game?",
    exitText: "You can pick up where you left off with the same token.",
    exitStay: "Keep playing",
    exitLeave: "Leave game",
  },
};

// ---------------------------------------------------------------------
//  CARDS — fixed order. Do not reorder or rename the ids: the results
//  sheet columns follow this exact order (see apps-script/Code.gs).
//  Photos: file names are listed in images/README.md.
//  spice: 1 = mild, 2 = medium, 3 = hot.
// ---------------------------------------------------------------------

const CARDS = [
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
    classicLine: "Masala Dosa stays just the way it is: crispy, golden, with sambar on the side.",
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
    classicLine: "Samosa stays classic: spiced potato, peas and two chutneys.",
  },
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
    photos: [
      { src: "images/korean-1.jpg", emoji: "🍗", caption: "Korean Fried Chicken", line: "Double-fried and glazed in sweet-spicy gochujang." },
      { src: "images/korean-2.jpg", emoji: "🍜", caption: "Ramyeon", line: "Fiery instant noodles, K-drama style." },
    ],
    teasers: ["Butter-chicken glazed Korean fried chicken", "Masala ramyeon with a jeera tadka"],
    authenticLine: "Korean stays Korean: gochujang, kimchi and all.",
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
    photos: [
      { src: "images/italian-1.jpg", emoji: "🍝", caption: "Pasta", line: "Penne in a rich tomato and basil sauce." },
      { src: "images/italian-2.jpg", emoji: "🍕", caption: "Pizza", line: "Thin crust, mozzarella and fresh basil." },
    ],
    teasers: ["Makhani pasta", "Achari paneer pizza"],
    authenticLine: "Italian stays Italian: olive oil, basil and parmesan.",
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
    classicLine: "Bhel Puri stays classic: puffed rice, sev, tamarind and green chutney.",
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
    photos: [
      { src: "images/thai-1.jpg", emoji: "🍛", caption: "Thai Green Curry", line: "Coconut curry with Thai basil and green chillies." },
      { src: "images/thai-2.jpg", emoji: "🍜", caption: "Pad Thai", line: "Stir-fried rice noodles with peanuts and lime." },
    ],
    teasers: ["Green curry with curry leaves, served with appam", "Pad Thai chaat with imli chutney"],
    authenticLine: "Thai stays Thai: lemongrass, basil and lime.",
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
    classicLine: "Soya Chaap stays classic: smoky, creamy and fresh off the tandoor.",
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
    photos: [
      { src: "images/mexican-1.jpg", emoji: "🌮", caption: "Tacos", line: "Soft tortillas with salsa and fillings." },
      { src: "images/mexican-2.jpg", emoji: "🌯", caption: "Burrito", line: "A wrap stuffed with rice, beans and cheese." },
    ],
    teasers: ["Tandoori paneer tacos", "Rajma-chawal burrito"],
    authenticLine: "Mexican stays Mexican: salsa, lime and jalapeños.",
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
    classicLine: "Pav Bhaji stays classic: a pool of butter, onions and lemon.",
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
    photos: [
      { src: "images/japanese-1.jpg", emoji: "🍣", caption: "Sushi", line: "Vinegared rice rolls with fresh fillings." },
      { src: "images/japanese-2.jpg", emoji: "🍜", caption: "Ramen", line: "Slow-cooked broth with noodles and egg." },
    ],
    teasers: ["Tandoori paneer sushi roll", "Rasam ramen"],
    authenticLine: "Japanese stays Japanese: soy, wasabi and ginger.",
  },
];
