// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offset = 80; // Account for fixed navbar
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Waitlist form handling
const waitlistForm = document.getElementById('waitlistForm');
const waitlistSuccess = document.getElementById('waitlistSuccess');

waitlistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(waitlistForm);
    const email = formData.get('email');
    const name = formData.get('name') || '';
    
    // Here you would typically send this to a backend API
    // For now, we'll simulate a successful submission
    console.log('Waitlist signup:', { email, name });
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Show success message
    waitlistForm.style.display = 'none';
    waitlistSuccess.style.display = 'block';
    
    // Scroll to success message
    waitlistSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Optional: Store in localStorage for demo purposes
    const waitlistData = JSON.parse(localStorage.getItem('waitlist') || '[]');
    waitlistData.push({ email, name, timestamp: new Date().toISOString() });
    localStorage.setItem('waitlist', JSON.stringify(waitlistData));
});

// Navbar scroll effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.boxShadow = 'none';
    }
    
    lastScroll = currentScroll;
});

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards and pricing cards
document.querySelectorAll('.feature-card, .pricing-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
});

// Handle privacy and support links
document.getElementById('privacyLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Privacy Policy: AgileEmails respects your privacy. All email processing happens locally in your browser. No data is sent to external servers. Your emails stay completely private.');
});

document.getElementById('supportLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Support: For support, please email support@agileemails.com or visit our support center.');
});


