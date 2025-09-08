// ===== Global Progress + Currency =====
let unlockedArenas = JSON.parse(localStorage.getItem("arenas")) || ["caveman"];

// Save progress
function saveProgress() {
  localStorage.setItem("chips", chips);
  localStorage.setItem("arenas", JSON.stringify(unlockedArenas));
}

// Load campaign page & enable unlocked arenas
function enterArena(arena) {
  location.href = `${arena}.html`;
}

window.onload = () => {
  if (document.body.classList.contains("campaign-screen")) {
    unlockedArenas.forEach(arena => {
      document.getElementById(arena + "Btn").disabled = false;
    });
  }
  if (document.body.classList.contains("arena-screen")) {
    initGame();
    updateHUD();
  }
};

/* =================== CONFIG =================== */
const STARTING_CHIPS = 250;
const TARGET_CHIPS   = 1000;
const CHIP_ICON_SRC  = "images/rock-icon.png"; // e.g., "chip.png" — leave empty for no icon
const TWISTS = {
  luckOfGodsChance: 0.10, // redeal once right after opening deal
  predatorBurnChance: 0.05, // burn 1 before deal
  wildTotem: true // first 2 you draw can count as 11 once
};

/* =================== STATE =================== */
const suits = ["♠","♥","♦","♣"];
const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

let deck = [];
let player = [];
let dealer = [];
let holeHidden = true;
let inHand = false;
let bet = 50;
let chips = STARTING_CHIPS;
let usedTotem = false;

/* =================== DOM =================== */
const $chips = document.getElementById("chips");
const $dealer = document.getElementById("dealer");
const $player = document.getElementById("player");
const $bet = document.getElementById("bet");
const $deal = document.getElementById("deal");
const $hit = document.getElementById("hit");
const $stand = document.getElementById("stand");
const $double = document.getElementById("double");
const $gg = document.getElementById("gg");
const $chipIcon = document.getElementById("chipIcon");
if (CHIP_ICON_SRC) { $chipIcon.src = CHIP_ICON_SRC; $chipIcon.style.display="block"; } else { $chipIcon.style.display="none"; }

/* =================== HELPERS =================== */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function freshDeck(){ const d=[]; for(const s of suits){ for(const r of ranks){ d.push({suit:s,rank:r}); } } return shuffle(d); }
function val(card){
  if(card.rank==="A") return 11;
  if(["K","Q","J"].includes(card.rank)) return 10;
  if(card.rank==="2" && TWISTS.wildTotem && card._as11) return 11; // totem boost
  return parseInt(card.rank);
}
function total(hand){
  let t=0, aces=0;
  for(const c of hand){ t+=val(c); if(c.rank==="A") aces++; }
  while(t>21 && aces>0){ t-=10; aces--; }
  return t;
}
function isBlackjack(hand){ return hand.length===2 && total(hand)===21; }
function draw(to){ to.push(deck.pop()); return to[to.length-1]; }

function renderHands(){
    // dealer
    $dealer.innerHTML="";
    dealer.forEach((c, i)=>{
      const el=document.createElement("div");
      el.className="card" + ((i===0 && holeHidden) ? " back" : "");
      el.textContent = (i===0 && holeHidden) ? "" : (c.rank + c.suit);
      $dealer.appendChild(el);
    });
    // player
    $player.innerHTML="";
    player.forEach(c=>{
      const el=document.createElement("div");
      el.className="card";
      el.textContent = c.rank + c.suit;
      $player.appendChild(el);
    });

    // update scores
    document.getElementById("playerScore").textContent = inHand ? total(player) : total(player);
    document.getElementById("dealerScore").textContent = holeHidden ? "?" : total(dealer);

    // buttons
    $hit.disabled = !inHand;
    $stand.disabled = !inHand;
    $double.disabled = !(inHand && player.length===2 && bet*2<=chips);
  }

function toast(msg, ms=1400){
  $gg.querySelector("div:first-of-type")?.remove(); // keep layout
  $gg.classList.add("show");
  setTimeout(()=>{$gg.classList.remove("show")}, ms);
}

function updateChips(){ $chips.textContent = chips; }

/* =================== FLOW =================== */
function startHand(){
  if(inHand) return;

  // read bet and validate
  bet = Math.max(1, Math.floor(+($bet.value || 1)));
  if(bet>chips){ alert("Bet exceeds your rocks."); return; }
  $bet.max = chips;

  // twists: predator burn before deal
  deck = freshDeck();
  if(Math.random()<TWISTS.predatorBurnChance){ deck.pop(); }

  player=[]; dealer=[]; holeHidden=true; usedTotem=false; inHand=true;

  // ante not removed up-front; we settle +/- bet at end (classic single bet)

  // initial deal (P, D[hole], P, D)
  draw(player);
  draw(dealer);          // hole (hidden)
  draw(player);
  draw(dealer);

  // Totem check on your initial two cards (mark first '2' as 11)
  if(TWISTS.wildTotem){
    for(const c of player){ if(!usedTotem && c.rank==="2"){ c._as11=true; usedTotem=true; break; } }
  }

  renderHands();

  // twists: luck of the gods (redeal right away)
  if(Math.random()<TWISTS.luckOfGodsChance){
    // soft redeal: no chip change
    setTimeout(()=>{ startHand(); }, 350);
    return;
  }
}

function doHit(){
  if(!inHand) return;
  const c = draw(player);
  // apply totem if still unused and you drew a 2
  if(TWISTS.wildTotem && !usedTotem && c.rank==="2"){ c._as11=true; usedTotem=true; }
  renderHands();

  if(total(player)>21){ // bust
    endHand("playerBust");
  }
}

function doDouble(){
  if(!(inHand && player.length===2)) return;
  if(bet*2>chips){ alert("Not enough rocks to double."); return; }
  bet*=2;
  doHit();
  if(inHand) doStand(); // if not already ended by bust
}

function doStand(){
  if(!inHand) return;
  holeHidden=false; renderHands();

  // Dealer plays: stand on 17+
  while(total(dealer) < 17){
    draw(dealer);
  }
  renderHands();
  endHand("compare");
}

function settle(outcome){
  // returns delta chips
  if(outcome==="playerBJ") return bet * 1.5;       // 3:2 payout
  if(outcome==="dealerBJ") return -bet;
  if(outcome==="playerWin") return bet;
  if(outcome==="dealerWin") return -bet;
  if(outcome==="push") return 0;
  if(outcome==="playerBust") return -bet;
  if(outcome==="dealerBust") return bet;
  return 0;
}

function endHand(reason){
  inHand=false;

  const pT = total(player);
  const dT = total(dealer);
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);

  let out="push";
  if(reason==="playerBust"){ out="playerBust"; }
  else if(pBJ && !dBJ){ out="playerBJ"; }
  else if(dBJ && !pBJ){ out="dealerBJ"; }
  else if(reason==="compare"){
    if(dT>21) out="dealerBust";
    else if(pT>21) out="playerBust";
    else if(pT>dT) out="playerWin";
    else if(pT<dT) out="dealerWin";
    else out="push";
  }

  const delta = settle(out);
  chips += delta;
  updateChips();

  // 🎯 NEW result message
  const msgBox = document.getElementById("resultMessage") || (() => {
    const div = document.createElement("div");
    div.id = "resultMessage";
    div.style.position = "fixed";
    div.style.top = "50%";
    div.style.left = "50%";
    div.style.transform = "translate(-50%, -50%)";
    div.style.padding = "16px 24px";
    div.style.background = "rgba(0,0,0,.7)";
    div.style.border = "2px solid #fff";
    div.style.borderRadius = "12px";
    div.style.fontSize = "20px";
    div.style.fontWeight = "bold";
    div.style.zIndex = "999";
    document.body.appendChild(div);
    return div;
  })();

  let txt = "";
  if(delta > 0) txt = `✅ You win! +${delta} chips`;
  else if(delta < 0) txt = `❌ You lose! ${delta} chips`;
  else txt = "➖ Push (tie)";

  msgBox.textContent = txt;
  msgBox.style.display = "block";

  // hide after 2.5s
  setTimeout(()=> msgBox.style.display="none", 2500);

  // check thresholds
  if(chips<=0){
    alert("You lost all your rocks. Resetting to 250…");
    chips = STARTING_CHIPS; updateChips();
  } else if(chips>=TARGET_CHIPS){
    $gg.classList.add("show");
  }

  renderHands();
}

/* =================== WIRE UI =================== */
$deal.addEventListener("click", startHand);
$hit.addEventListener("click", doHit);
$stand.addEventListener("click", doStand);
$double.addEventListener("click", doDouble);

// init
updateChips();
renderHands();

document.addEventListener("DOMContentLoaded", () => {
  const intro = document.getElementById("intro");
  const introClose = document.getElementById("introClose");
  if (!intro) return;

  // show intro toast like the win popup
  intro.classList.add("show");

  // disable table controls while intro is visible
  const dealBtn = document.getElementById("deal");
  const hitBtn = document.getElementById("hit");
  const standBtn = document.getElementById("stand");
  const doubleBtn = document.getElementById("double");
  const disableControls = (on)=> {
    if(!dealBtn||!hitBtn||!standBtn||!doubleBtn) return;
    dealBtn.disabled = on ? true : false;
    hitBtn.disabled = true;
    standBtn.disabled = true;
    doubleBtn.disabled = true;
  };
  disableControls(true);

  const closeIntro = () => {
    intro.classList.remove("show");
    // re-enable just Deal; others will enable after deal
    disableControls(false);
    hitBtn.disabled = true;
    standBtn.disabled = true;
    doubleBtn.disabled = true;
  };

  introClose?.addEventListener("click", closeIntro);
  // Optional: close on ESC
  document.addEventListener("keydown", function onEsc(e){
    if(e.key==="Escape"){ closeIntro(); document.removeEventListener("keydown", onEsc); }
  });
});