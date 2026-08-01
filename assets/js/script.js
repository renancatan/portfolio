const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');

navToggle?.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!open));
  siteNav?.classList.toggle('open', !open);
});

siteNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navToggle?.setAttribute('aria-expanded', 'false');
    siteNav.classList.remove('open');
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const chatDialog = document.querySelector('#ask-renan');
const chatForm = chatDialog?.querySelector('[data-chat-form]');
const chatInput = chatForm?.querySelector('input');
const chatMessages = chatDialog?.querySelector('[data-chat-messages]');
const chatEndpoint = window.PORTFOLIO_ASK_API_URL || chatDialog?.dataset.apiEndpoint || '';

function addChatMessage(role, text) {
  const message = document.createElement('div');
  message.className = `chat-message ${role}`;
  const label = document.createElement('span');
  label.textContent = role === 'assistant' ? 'AI' : 'You';
  const content = document.createElement('p');
  content.textContent = text;
  message.append(label, content);
  chatMessages?.append(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return message;
}

document.querySelectorAll('[data-chat-open]').forEach((button) => {
  button.addEventListener('click', () => {
    chatDialog?.showModal();
    chatInput?.focus();
  });
});

chatDialog?.querySelector('[data-chat-close]')?.addEventListener('click', () => chatDialog.close());
chatDialog?.addEventListener('click', (event) => {
  if (event.target === chatDialog) chatDialog.close();
});

chatDialog?.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!chatInput) return;
    chatInput.value = button.dataset.question || '';
    chatForm?.requestSubmit();
  });
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = chatInput?.value.trim() || '';
  if (question.length < 3) return;

  addChatMessage('user', question);
  chatInput.value = '';
  chatInput.disabled = true;
  const submit = chatForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  const pending = addChatMessage('assistant', 'Thinking…');

  try {
    if (!chatEndpoint) throw new Error('The assistant is not connected yet.');
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The assistant is unavailable.');
    pending.querySelector('p').textContent = payload.answer;
  } catch (error) {
    pending.classList.add('error');
    pending.querySelector('p').textContent = `${error.message} You can still explore the detailed skills page.`;
  } finally {
    chatInput.disabled = false;
    submit.disabled = false;
    chatInput.focus();
  }
});
