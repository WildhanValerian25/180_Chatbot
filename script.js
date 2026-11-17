const chatContainer = document.getElementById("chatContainer");
const messagesList = document.getElementById("messagesList");
const emptyState = document.getElementById("emptyState");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const newChatBtn = document.getElementById("newChatBtn");
const themeToggle = document.getElementById("themeToggle");
const statusText = document.getElementById("statusText");

let conversation = [];
let abortController = null;
let isStreaming = false;