// Curated Unicode emoji and locally bundled Lucide symbols. No remote requests.
(function(root) {
  const groups = [
    ['learning','Learning & study','school education revision exam flashcards homework research learning',
      '📚|Books;📖|Reading;📕|Textbook;📗|Notebook green;📘|Reference book;📙|Workbook;📓|Notes;📔|Journal;📒|Ledger;📝|Writing notes;✏️|Pencil;🖊️|Pen;🖋️|Fountain pen;🖍️|Crayon;📏|Ruler;📐|Geometry;🎓|Graduation;🏫|School;🎒|School bag;🔖|Bookmark;💡|Idea;🧠|Brain memory;🗂️|Flashcards;✅|Complete;💯|Exam score',
      'book-open book-text book-marked notebook notebook-pen library graduation-cap school backpack pencil pen-tool ruler triangle bookmark lightbulb brain languages highlighter clipboard-check'],
    ['coding','Coding & technology','programming software web developer html css javascript python git computer tech',
      '💻|Laptop coding;🖥️|Desktop computer;⌨️|Keyboard;🖱️|Mouse;💾|Save disk;💿|Disc;📀|DVD;🔌|Power plug;🔋|Battery;🪫|Low battery;🤖|Robot ai;👾|Game alien;🐛|Bug debug;🕸️|Web;🌐|Internet;📡|Network satellite;🛰️|Satellite;🔒|Security;🔑|Key password;⚙️|Settings;🧩|Plugin puzzle;🛠️|Tools;📱|Phone;📲|Mobile app;☁️|Cloud',
      'code code-xml terminal square-terminal brackets braces binary bug git-branch git-commit-horizontal git-merge git-pull-request github database server network cpu memory-stick hard-drive monitor laptop keyboard mouse smartphone wifi cloud-cog shield-check key-round cable plug-zap bot workflow'],
    ['japanese','Japanese & languages','japan japanese nihongo kanji hiragana katakana kana vocabulary grammar language translation 日本 日本語 漢字 ひらがな カタカナ 語彙',
      '🇯🇵|Japan;🗾|Map of Japan;🗻|Mount Fuji;⛩️|Torii shrine;🏯|Japanese castle;🏮|Lantern;🎎|Hina dolls;🎏|Koinobori carp streamer;🎐|Wind chime;🎋|Tanabata;🎍|Kadomatsu new year;🌸|Sakura cherry blossom;👘|Kimono;🥋|Martial arts;🍵|Green tea matcha;🍣|Sushi;🍙|Onigiri rice ball;🍱|Bento;🍜|Ramen;🍡|Dango;🍥|Narutomaki;🥢|Chopsticks;🍶|Sake;🈳|Vacant kanji;🈵|Full kanji;🈶|Available kanji;🈚|Free of charge kanji;🉐|Bargain kanji;🈴|Pass kanji;🈲|Forbidden kanji',
      'languages speech message-circle book-a a-large-small whole-word case-sensitive text-cursor-input audio-lines headphones mic cherry flower-2 mountain origami fan torus'],
    ['fantasy','Fantasy & worldbuilding','magic wizard witch rpg dnd dungeons dragons medieval lore mana factions kingdoms story',
      '🐉|Dragon;🐲|Dragon face;🧙|Wizard mage witch;🧝|Elf;🧚|Fairy;🧛|Vampire;🧟|Zombie;🧜|Merfolk mermaid;🧞|Genie;🦄|Unicorn;🦇|Bat;🐺|Wolf;🦅|Eagle;🔮|Crystal ball divination;🪄|Magic wand;✨|Magic sparkles;⚔️|Swords;🗡️|Dagger;🛡️|Shield;🏹|Bow archery;🪓|Axe;👑|Crown royalty;🏰|Castle;📜|Scroll lore;🕯️|Candle;⚗️|Alchemy;🧪|Potion;💎|Gem;🗝️|Ancient key;🧿|Amulet;🪬|Talisman;💀|Skull;☠️|Poison;🪦|Grave;🎲|Dice tabletop',
      'wand-sparkles sparkles sword swords shield shield-half target axe crown castle scroll scroll-text flame gem key skull ghost moon-star orbit flask-round flask-conical feather eye dices dice-6 compass map mountain-snow tent-tree castle'],
    ['writing','Writing & creativity','author novel plot scenes character art drawing design music craft poetry crochet knitting sewing yarn',
      '✍️|Writing;📃|Page;📄|Document;📑|Chapters;📰|Newspaper;🗞️|News;📜|Manuscript;🖌️|Paintbrush;🎨|Palette;🖼️|Artwork;🧵|Thread;🪡|Needle sewing;🧶|Yarn crochet;✂️|Scissors;🎭|Theatre drama;🎬|Film;🎥|Movie camera;📷|Photography;🎵|Music;🎶|Melody;🎤|Singing;🎧|Headphones;🎹|Piano;🎸|Guitar;🎻|Violin;🥁|Drums;💭|Thought;💬|Dialogue',
      'feather notebook-text file-pen-line file-text quote text-cursor type book-open-text clapperboard film camera palette paintbrush paint-bucket pen-tool scissors spline brush music music-2 guitar piano drum theater lightbulb'],
    ['food','Food & cooking','food cooking recipe meal groceries nutrition baking drink kitchen',
      '🍎|Apple;🍏|Green apple;🍐|Pear;🍊|Orange;🍋|Lemon;🍌|Banana;🍉|Watermelon;🍇|Grapes;🍓|Strawberry;🫐|Blueberries;🍒|Cherries;🍑|Peach;🥭|Mango;🍍|Pineapple;🥥|Coconut;🥝|Kiwi;🍅|Tomato;🥑|Avocado;🥦|Broccoli;🥬|Leafy greens;🥒|Cucumber;🌶️|Chili;🫑|Bell pepper;🌽|Corn;🥕|Carrot;🧄|Garlic;🧅|Onion;🥔|Potato;🍄|Mushroom;🍞|Bread;🥐|Croissant;🥖|Baguette;🥨|Pretzel;🥯|Bagel;🥞|Pancakes;🧇|Waffle;🧀|Cheese;🥚|Egg;🍳|Breakfast;🥓|Bacon;🥩|Steak;🍗|Chicken;🍔|Burger;🍟|Fries;🍕|Pizza;🌮|Taco;🌯|Burrito;🥙|Pita;🥗|Salad;🍝|Pasta;🥘|Paella;🍲|Stew;🍛|Curry;🍚|Rice;🥟|Dumpling;🍤|Shrimp;🍦|Ice cream;🍰|Cake;🎂|Birthday cake;🧁|Cupcake;🍪|Cookie;🍩|Donut;🍫|Chocolate;🍬|Candy;🍯|Honey;☕|Coffee;🫖|Teapot;🧋|Bubble tea boba;🥛|Milk;🧃|Juice;🍷|Wine;🍺|Beer;🍸|Cocktail;🥣|Bowl;🍽️|Plate;🔪|Kitchen knife',
      'utensils utensils-crossed chef-hat cooking-pot soup salad sandwich pizza sandwich beef fish egg egg-fried drumstick carrot apple banana cherry grape citrus wheat croissant cookie cake cake-slice ice-cream-cone candy lollipop popcorn coffee cup-soda milk wine beer martini glass-water cup-soda'],
    ['health','Health & cycle','health medicine medical wellness period menstrual menstruation cycle fertility symptoms pain care',
      '🩸|Period blood menstruation;📅|Cycle calendar;🌡️|Temperature fever;💊|Medication pill;💉|Injection vaccine;🩺|Doctor stethoscope;🩹|Bandage;🩼|Crutch;🦷|Tooth dentist;🦴|Bone;🫀|Heart organ;🫁|Lungs;🧬|DNA genetics;🧠|Mental health;💗|Self care;💤|Sleep;🛌|Rest;🛁|Bath;🧘|Meditation;🤰|Pregnancy;🤱|Nursing;🤒|Illness;🤕|Injury headache;🤢|Nausea;🥱|Tired fatigue;😴|Sleeping;💧|Hydration;🌙|Cycle phase moon;🔥|Heat cramps;🏥|Hospital;🚑|Ambulance;🧼|Hygiene soap',
      'droplet calendar-heart calendar-days heart-pulse activity stethoscope thermometer pill syringe bandage hospital ambulance cross brain heart-handshake bed bath moon baby dna bone accessibility eye ear hand hand-helping'],
    ['science','Science & mathematics','science chemistry physics biology astronomy math mathematics equation lab experiment research',
      '🔬|Microscope;🔭|Telescope;🧪|Test tube;🧫|Petri dish;⚗️|Chemistry;🧬|Genetics;🦠|Microbe;🧲|Magnet;⚛️|Atom;⚡|Electricity;💡|Light;📡|Radio;🚀|Rocket;🪐|Saturn planet;🌌|Galaxy;☄️|Comet;🌍|Earth;📊|Statistics;📈|Graph;🧮|Abacus;➕|Plus;➖|Minus;✖️|Multiply;➗|Divide;♾️|Infinity;📐|Angles',
      'microscope telescope flask-conical flask-round test-tube test-tubes dna atom magnet zap orbit rocket satellite radar radiation biohazard calculator sigma pi infinity radical percent equal divide plus minus chart-line chart-scatter ruler'],
    ['nature','Nature & animals','nature animals plants flowers garden outdoors ecology weather environment',
      '🌱|Seedling;🌿|Herb;☘️|Shamrock;🍀|Clover;🌵|Cactus;🌴|Palm;🌲|Evergreen;🌳|Tree;🍂|Autumn leaves;🍁|Maple leaf;🌾|Grain;🌻|Sunflower;🌹|Rose;🌷|Tulip;🪷|Lotus;🌺|Hibiscus;💐|Bouquet;🪻|Hyacinth;🐈|Cat;🐕|Dog;🐇|Rabbit;🦊|Fox;🐻|Bear;🐼|Panda;🐨|Koala;🐯|Tiger;🦁|Lion;🐎|Horse;🦌|Deer;🦉|Owl;🐦|Bird;🦋|Butterfly;🐝|Bee;🐞|Ladybug;🐌|Snail;🐢|Turtle;🐍|Snake;🐸|Frog;🐟|Fish;🐬|Dolphin;🐋|Whale;🦈|Shark;🐙|Octopus;🪸|Coral;☀️|Sun;🌧️|Rain;⛈️|Storm;❄️|Snow;🌈|Rainbow;🌊|Ocean',
      'leaf sprout flower flower-2 flower tree-pine tree-deciduous trees clover sprout shrub bird cat dog rabbit squirrel turtle snail fish fish-symbol shell paw-print bug bug sun cloud-rain cloud-lightning snowflake rainbow waves wind mountain'],
    ['history','History & time','history ancient period era civilization archaeology religion faith mythology timeline time calendar',
      '🏛️|Ancient temple classical period;🏺|Amphora archaeology;🗿|Moai;🪨|Stone age;🦴|Fossil;⚱️|Urn;🏰|Medieval castle;👑|Monarchy;📜|Ancient scroll;🕰️|Clock;⏳|Hourglass;⌛|Time;⏱️|Stopwatch;🗓️|Calendar;🧭|Compass;⚓|Anchor;🛶|Canoe;⛵|Sailing;🕌|Mosque;🕍|Synagogue;⛪|Church;🛕|Temple;🕋|Kaaba;☯️|Yin yang;☸️|Dharma;✝️|Christian cross;☪️|Star and crescent;✡️|Star of David;🕉️|Om;🕯️|Remembrance',
      'landmark amphora scroll scroll-text castle church pyramid hourglass history clock clock-3 calendar calendar-days timer alarm-clock watch crown anchor ship sailboat compass map map-pinned book-key brick-wall'],
    ['travel','Travel & places','travel vacation geography maps transport trip destination city country',
      '🗺️|World map;🧭|Compass;📍|Location;📌|Pin;🌍|Europe Africa;🌎|Americas;🌏|Asia Pacific;✈️|Airplane;🚁|Helicopter;🚂|Train;🚆|Railway;🚇|Metro;🚌|Bus;🚗|Car;🚕|Taxi;🏍️|Motorcycle;🚲|Bicycle;🚢|Ship;⛵|Sailboat;🧳|Luggage;🏕️|Camping;⛺|Tent;🏖️|Beach;🏝️|Island;🏔️|Mountain;🌋|Volcano;🏜️|Desert;🏞️|National park;🏙️|City;🌉|Bridge;🏠|Home;🏨|Hotel;🏪|Shop;⛽|Fuel',
      'map map-pin map-pinned compass globe plane train-front tram-front bus car car-taxi-front bike ship sailboat luggage tent tent-tree mountain mountain-snow signpost hotel house building building-2 store fuel navigation route footprints'],
    ['planning','Planning & work','productivity planning work job office organization tasks todo goals finance money budget schedule',
      '📋|Checklist;🗒️|Notepad;📆|Schedule;✅|Done;☑️|Checked;❌|Cancel;❗|Important;❓|Question;🎯|Goal target;🏆|Achievement;🥇|First place;⏰|Alarm reminder;🔔|Notification;📁|Folder;📂|Open folder;🗃️|Archive;🗄️|File cabinet;📦|Package;💼|Work briefcase;📎|Attachment;🖇️|Paperclips;📨|Message;📧|Email;📫|Mailbox;📞|Phone call;💰|Money;💵|Cash;💳|Credit card;🏦|Bank;🧾|Receipt;⚖️|Balance legal;🔐|Private;🔓|Unlocked',
      'list-todo list-checks clipboard-list calendar-check check circle-check target trophy medal alarm-clock bell folder folder-open archive inbox mail paperclip briefcase-business contact users presentation wallet credit-card banknote coins piggy-bank receipt scale lock-keyhole lock-open'],
    ['life','Life & hobbies','daily life hobbies fitness sport games home chores shopping clothes beauty relationships',
      '🏃|Running;🚶|Walking;🏋️|Strength training;🤸|Gymnastics;🏊|Swimming;🚴|Cycling;⚽|Soccer;🏀|Basketball;🏈|Football;⚾|Baseball;🎾|Tennis;🏸|Badminton;🏓|Table tennis;🎳|Bowling;🎮|Video games;🕹️|Arcade;♟️|Chess;🎲|Board games;🧩|Puzzle;🛍️|Shopping;🛒|Groceries;👕|Clothes;👗|Dress;👟|Shoes;💄|Makeup;💅|Nails;🧴|Skincare;🧹|Cleaning;🧺|Laundry;🛋️|Home sofa;🪴|Houseplant;🔧|Repair;🎁|Gift;🎉|Celebration;🎈|Party;❤️|Love;🤝|Partnership;🫂|Support',
      'dumbbell bike person-standing footprints volleyball goal gamepad-2 joystick puzzle dice-6 spade club heart diamond shopping-bag shopping-cart shirt scissors sparkle bath sofa armchair lamp washing-machine wrench hammer gift party-popper party-popper handshake users-round'],
    ['moods','People & moods','emotion feeling mood people smile happy sad tired journal character personality',
      '😀|Happy smile;😊|Content;🥰|Loved;😍|Adoration;🤩|Excited;😎|Cool;🤓|Nerd study;🧐|Curious;🤔|Thinking;🤗|Hug;🤫|Quiet;🤭|Giggle;😐|Neutral;😑|Unimpressed;🙃|Upside down;😅|Relieved nervous;🥲|Bittersweet;😔|Sad;😢|Crying;😭|Grief;😤|Frustrated;😠|Angry;🤯|Overwhelmed;😰|Anxious;😱|Scared;🥶|Cold;🥵|Hot;🤠|Cowboy;🥳|Party;😇|Angel;😈|Devil;👻|Ghost;👽|Alien;🤖|Robot;👤|Person;👥|Group;👩‍🎓|Student;👩‍💻|Developer;👩‍🍳|Chef;👩‍⚕️|Healthcare worker',
      'smile smile-plus laugh meh frown angry annoyed smile circle-user-round user-round users-round contact glasses glasses brain heart hand-heart thumbs-up thumbs-down message-circle heart-crack'],
    ['marks','Shapes & markers','symbols marks arrows stars geometry bullet navigation ornamental decorative',
      '🔴|Red circle;🟠|Orange circle;🟡|Yellow circle;🟢|Green circle;🔵|Blue circle;🟣|Purple circle;🟤|Brown circle;⚫|Black circle;⚪|White circle;🟥|Red square;🟧|Orange square;🟨|Yellow square;🟩|Green square;🟦|Blue square;🟪|Purple square;🟫|Brown square;⬛|Black square;⬜|White square;🔶|Orange diamond;🔷|Blue diamond;🔺|Up triangle;🔻|Down triangle;⭐|Star;🌟|Glowing star;💠|Diamond;🔘|Radio button;🔰|Beginner mark;🚩|Flag;🏁|Finish;♻️|Recycle',
      'circle square triangle diamond hexagon octagon pentagon star asterisk sparkle sparkles circle-dot circle-dashed square-dashed chevron-right chevrons-right arrow-right arrow-up arrow-down arrow-left arrow-up-right move-right corner-down-right flag flag-triangle-right hash at-sign ampersand infinity circle-help circle-alert ban recycle']
  ];
  const glyphs = [
    ['学','Study / learning','gaku manabu 学習 学ぶ'],['語','Language / words','go nihongo 言語 日本語'],['字','Character / kanji','ji moji 文字 漢字'],['あ','Hiragana','a kana ひらがな'],['ア','Katakana','a kana カタカナ'],['日','Day / Japan','nichi hi 日本'],['本','Book / origin','hon book 本'],['文','Writing / grammar','bun bunpou 文法'],['読','Reading','yomu doku 読む'],['書','Writing practice','kaku sho 書く'],['聞','Listening','kiku bun 聞く'],['話','Speaking','hanasu kaiwa 会話'],['食','Food / eating','taberu shoku 食べる'],['心','Heart / mind','kokoro shin 心'],['月','Moon / month','tsuki getsu 月'],['花','Flower','hana ka 花'],['水','Water','mizu sui 水'],['火','Fire','hi ka 火'],['木','Tree / wood','ki moku 木'],['金','Gold / money','kane kin 金'],['土','Earth / soil','tsuchi do 土'],['山','Mountain','yama san 山'],['空','Sky / empty','sora kuu 空'],['夢','Dream','yume mu 夢'],['道','Path / way','michi dou 道'],['龍','Dragon','ryuu ryu 龍'],['魔','Magic','ma mahou 魔法'],['剣','Sword','ken tsurugi 剣']
  ];
  const categories = groups.map(([id,label,keywords])=>({id,label,keywords}));
  const entries=[];
  for(const [category,,keywords,emoji,symbols] of groups) {
    for(const item of emoji.split(';')) {
      const [value,label]=item.split('|');
      entries.push({id:`emoji-${category}-${entries.length}`,kind:'emoji',value,label,category,keywords});
    }
    for(const name of new Set(symbols.split(' '))) entries.push({id:`symbol-${category}-${name}`,kind:'symbol',name,value:`symbol:${name}`,label:name.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' '),category,keywords});
  }
  for(const [glyph,label,keywords] of glyphs) entries.push({id:`symbol-japanese-${glyph}`,kind:'symbol',name:`jp-${glyph.codePointAt(0).toString(16)}`,value:`symbol:jp-${glyph.codePointAt(0).toString(16)}`,glyph,label,category:'japanese',keywords:`japan japanese nihongo 日本語 漢字 ${keywords}`});
  const fold = value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
  function search({kind='emoji',category='',query=''}={}) {
    const words=fold(query).trim().split(/\s+/).filter(Boolean), seen=new Set();
    return entries.filter(e=>e.kind===kind&&(!category||e.category===category)&&words.every(word=>fold(`${e.label} ${e.name||''} ${e.value} ${e.category} ${e.keywords}`).includes(word))).filter(e=>{if(seen.has(e.value))return false;seen.add(e.value);return true;});
  }
  function getSymbolMarkup(value, paths=root.SanctumPageSymbolPaths||{}) {
    const name=typeof value==='string'&&value.startsWith('symbol:')?value.slice(7):'';
    if(!name||!Object.prototype.hasOwnProperty.call(paths,name))return '';
    return `<svg class="page-symbol-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  }
  root.SanctumIconCatalog={categories,entries,search,getSymbolMarkup};
  if(typeof module!=='undefined') module.exports=root.SanctumIconCatalog;
})(typeof window!=='undefined'?window:globalThis);
