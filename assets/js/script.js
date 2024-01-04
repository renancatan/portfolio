// Function to open a modal
function openModal(modal) {
    if (modal == null) return;
    modal.style.display = 'block';
  }
  
  // Function to close a modal
  function closeModal(modal) {
    if (modal == null) return;
    modal.style.display = 'none';
  }
  
  // Add event listeners for the modal buttons
  document.querySelectorAll('.modal-btn').forEach(button => {
    button.addEventListener('click', () => {
      const modal = document.querySelector(button.dataset.modalTarget);
      openModal(modal);
    });
  });
  
  // Add event listeners for closing the modal
  document.querySelectorAll('.close-btn').forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('.modal');
      closeModal(modal);
    });
  });
  
  // Close modal when clicking outside of it
  window.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) {
      closeModal(e.target);
    }
  });  