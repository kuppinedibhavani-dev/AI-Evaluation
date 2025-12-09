// ===== Firebase Config =====
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDoUGYCKyDBoEF-9F_snItn7ZmGKo8SwVU",
  authDomain: "time-tracking-app-21a27.firebaseapp.com",
  databaseURL: "https://time-tracking-app-21a27-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "time-tracking-app-21a27",
  storageBucket: "time-tracking-app-21a27.firebasestorage.app",
  messagingSenderId: "359178272620",
  appId: "1:359178272620:web:bdaf753d258c63e2cb3d49",
  measurementId: "G-WCQ7BV3WSK"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ===== DOM Elements =====
const landingSection = document.getElementById("landing-section");
const appSection = document.getElementById("app-section");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const userEmailText = document.getElementById("user-email");
const datePicker = document.getElementById("date-picker");
const remainingText = document.getElementById("remaining-text");
const activityForm = document.getElementById("activity-form");
const activityList = document.getElementById("activity-list");
const analyseBtn = document.getElementById("analyse-btn");

const noDataView = document.getElementById("no-data-view");
const dashboardView = document.getElementById("dashboard-view");

const totalTimeText = document.getElementById("total-time-text");
const activityCountText = document.getElementById("activity-count-text");

let currentUser = null;
let currentDate = null;
let currentActivities = [];
let editingId = null;

let categoryChart = null;
let activityChart = null;

// ===== Helpers =====
function getToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function switchToApp() {
  landingSection.classList.add("hidden");
  appSection.classList.remove("hidden");
}

function switchToLanding() {
  appSection.classList.add("hidden");
  landingSection.classList.remove("hidden");
}

// ===== Auth state listener =====
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    userEmailText.textContent = user.email || "";
    switchToApp();

    if (!datePicker.value) {
      datePicker.value = getToday();
    }
    currentDate = datePicker.value;
    loadActivities();
  } else {
    currentUser = null;
    switchToLanding();
  }
});

// ===== Auth actions =====
loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  signupBtn.disabled = true;
  loginBtn.textContent = "Logging in...";
  try {
    const cred = await auth.signInWithEmailAndPassword(
      emailInput.value,
      passwordInput.value
    );
    currentUser = cred.user;
    userEmailText.textContent = cred.user.email || "";
    switchToApp();
    if (!datePicker.value) datePicker.value = getToday();
    currentDate = datePicker.value;
    loadActivities();
  } catch (err) {
    alert(err.message);
  } finally {
    loginBtn.disabled = false;
    signupBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});

signupBtn.addEventListener("click", async () => {
  signupBtn.disabled = true;
  loginBtn.disabled = true;
  signupBtn.textContent = "Creating...";
  try {
    const cred = await auth.createUserWithEmailAndPassword(
      emailInput.value,
      passwordInput.value
    );
    currentUser = cred.user;
    userEmailText.textContent = cred.user.email || "";
    switchToApp();
    if (!datePicker.value) datePicker.value = getToday();
    currentDate = datePicker.value;
    loadActivities();
  } catch (err) {
    alert(err.message);
  } finally {
    signupBtn.disabled = false;
    loginBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
});

logoutBtn.addEventListener("click", async () => {
  await auth.signOut();
});

// ===== Date change =====
datePicker.addEventListener("change", () => {
  currentDate = datePicker.value;
  editingId = null;
  activityForm.reset();
  loadActivities();
});

// ===== Load activities for selected date (only on login/date change) =====
async function loadActivities() {
  if (!currentUser || !currentDate) return;

  const activitiesRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("days")
    .doc(currentDate)
    .collection("activities");

  const snapshot = await activitiesRef.orderBy("createdAt", "asc").get();

  currentActivities = [];
  snapshot.forEach((doc) => {
    currentActivities.push({ id: doc.id, ...doc.data() });
  });

  renderActivities();
  updateAnalytics();
}

// ===== Render activities =====
function renderActivities() {
  activityList.innerHTML = "";

  const totalMinutes = currentActivities.reduce((sum, a) => sum + a.duration, 0);
  const remaining = 1440 - totalMinutes;
  remainingText.textContent = `You have ${remaining} minutes left for this day.`;

  analyseBtn.disabled = currentActivities.length === 0;

  currentActivities.forEach((activity) => {
    const item = document.createElement("div");
    item.className = "activity-item";

    item.innerHTML = `
      <div class="activity-meta">
        <strong>${activity.name}</strong>
        <span class="category">${activity.category} • ${activity.duration} min</span>
      </div>
      <div class="activity-actions">
        <button data-id="${activity.id}" class="edit-btn">Edit</button>
        <button data-id="${activity.id}" class="delete-btn">Delete</button>
      </div>
    `;

    activityList.appendChild(item);
  });

  activityList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteActivity(btn.dataset.id));
  });

  activityList.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => startEditActivity(btn.dataset.id));
  });
}

// ===== Add / Edit submit =====
activityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentUser || !currentDate) return;

  const name = document.getElementById("activity-name").value.trim();
  const category = document.getElementById("activity-category").value;
  const duration = parseInt(document.getElementById("activity-duration").value, 10);

  if (!name || !duration || duration <= 0) {
    alert("Please provide valid activity details.");
    return;
  }

  const totalMinutes = currentActivities.reduce((sum, a) => sum + a.duration, 0);

  if (!editingId) {
    // NEW
    if (totalMinutes + duration > 1440) {
      alert("Total minutes for the day cannot exceed 1440.");
      return;
    }
    optimisticAdd({ name, category, duration });
  } else {
    // EDIT
    const old = currentActivities.find((a) => a.id === editingId);
    const adjustedTotal = totalMinutes - (old ? old.duration : 0) + duration;
    if (adjustedTotal > 1440) {
      alert("Total minutes for the day cannot exceed 1440.");
      return;
    }
    optimisticUpdate(editingId, { name, category, duration });
  }

  activityForm.reset();
  editingId = null;
});

// ===== Optimistic Add =====
function optimisticAdd(activity) {
  if (!currentUser || !currentDate) return;

  const tempId = "temp-" + Date.now() + "-" + Math.random();
  const now = Date.now();

  // 1) Update UI immediately
  currentActivities.push({
    id: tempId,
    ...activity,
    createdAt: now,
  });
  renderActivities();
  updateAnalytics();

  // 2) Firestore in background
  const dayRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("days")
    .doc(currentDate);

  const activitiesRef = dayRef.collection("activities");

  activitiesRef
    .add({
      ...activity,
      createdAt: now,
    })
    .then((docRef) => {
      // Replace temp id with real id
      const idx = currentActivities.findIndex((a) => a.id === tempId);
      if (idx !== -1) {
        currentActivities[idx].id = docRef.id;
      }
    })
    .catch((err) => {
      // On error, remove the optimistic item and show message
      currentActivities = currentActivities.filter((a) => a.id !== tempId);
      renderActivities();
      updateAnalytics();
      alert("Failed to save activity. Please try again.");
      console.error(err);
    });
}

// ===== Optimistic Update =====
function optimisticUpdate(id, activity) {
  if (!currentUser || !currentDate) return;

  const idx = currentActivities.findIndex((a) => a.id === id);
  if (idx === -1) return;

  // 1) Update UI immediately
  currentActivities[idx] = {
    ...currentActivities[idx],
    ...activity,
  };
  renderActivities();
  updateAnalytics();

  // 2) Firestore in background
  const docRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("days")
    .doc(currentDate)
    .collection("activities")
    .doc(id);

  docRef.update(activity).catch((err) => {
    alert("Failed to update activity. Please refresh.");
    console.error(err);
  });
}

// ===== Optimistic Delete =====
async function deleteActivity(id) {
  if (!currentUser || !currentDate) return;

  // 1) Remove from UI immediately
  const before = currentActivities;
  currentActivities = currentActivities.filter((a) => a.id !== id);
  renderActivities();
  updateAnalytics();

  // 2) Firestore in background
  const docRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("days")
    .doc(currentDate)
    .collection("activities")
    .doc(id);

  docRef.delete().catch((err) => {
    // On error, restore previous state
    currentActivities = before;
    renderActivities();
    updateAnalytics();
    alert("Failed to delete activity. Please try again.");
    console.error(err);
  });

  if (editingId === id) {
    editingId = null;
    activityForm.reset();
  }
}

function startEditActivity(id) {
  const activity = currentActivities.find((a) => a.id === id);
  if (!activity) return;

  document.getElementById("activity-name").value = activity.name;
  document.getElementById("activity-category").value = activity.category;
  document.getElementById("activity-duration").value = activity.duration;
  editingId = id;
}

// ===== Analytics & Charts =====
function updateAnalytics() {
  if (!currentActivities || currentActivities.length === 0) {
    noDataView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    destroyCharts();
    return;
  }

  noDataView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  const totalMinutes = currentActivities.reduce((sum, a) => sum + a.duration, 0);
  const activityCount = currentActivities.length;

  totalTimeText.textContent = `${(totalMinutes / 60).toFixed(1)} h`;
  activityCountText.textContent = activityCount;

  const categoryMap = {};
  currentActivities.forEach((a) => {
    if (!categoryMap[a.category]) categoryMap[a.category] = 0;
    categoryMap[a.category] += a.duration;
  });

  const categoryLabels = Object.keys(categoryMap);
  const categoryValues = Object.values(categoryMap);

  const activityLabels = currentActivities.map((a) => a.name);
  const activityValues = currentActivities.map((a) => a.duration);

  drawCategoryChart(categoryLabels, categoryValues);
  drawActivityChart(activityLabels, activityValues);
}

function destroyCharts() {
  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }
  if (activityChart) {
    activityChart.destroy();
    activityChart = null;
  }
}

function drawCategoryChart(labels, data) {
  const ctx = document.getElementById("category-chart").getContext("2d");
  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });
}

function drawActivityChart(labels, data) {
  const ctx = document.getElementById("activity-chart").getContext("2d");
  if (activityChart) activityChart.destroy();

  activityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data
        }
      ]
    },
    options: {
      scales: {
        x: {
          ticks: { color: "#e5e7eb" }
        },
        y: {
          ticks: { color: "#e5e7eb" }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// ===== Analyse button =====
analyseBtn.addEventListener("click", () => {
  if (!currentActivities || currentActivities.length === 0) return;
  updateAnalytics();
  dashboardView.scrollIntoView({ behavior: "smooth" });
});
