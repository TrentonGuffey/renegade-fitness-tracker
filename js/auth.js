import { supabase } from './supabase.js'

// ── Tab Switching ──
window.showTab = (tab) => {
    const loginForm = document.getElementById('loginForm')
    const signupForm = document.getElementById('signupForm')
    const loginTab = document.getElementById('loginTab')
    const signupTab = document.getElementById('signupTab')

    if (tab === 'login') {
        loginForm.style.display = 'block'
        signupForm.style.display = 'none'
        loginTab.classList.add('active')
        signupTab.classList.remove('active')
    } else {
        loginForm.style.display = 'none'
        signupForm.style.display = 'block'
        loginTab.classList.remove('active')
        signupTab.classList.add('active')
    }
    clearMessage()
}

// ── Show Message ──
const showMessage = (msg, isError = false) => {
    const el = document.getElementById('authMessage')
    el.textContent = msg
    el.className = 'auth-message' + (isError ? ' error' : '')
}

const clearMessage = () => {
    const el = document.getElementById('authMessage')
    el.textContent = ''
    el.className = 'auth-message'
}

// ── Login ──
window.handleLogin = async () => {
    const email = document.getElementById('loginEmail').value.trim()
    const password = document.getElementById('loginPassword').value
    const mfaCode = document.getElementById('mfaCode').value.trim()

    if (!email || !password) {
        showMessage('Please enter your email and password.', true)
        return
    }

    showMessage('Signing in...')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        showMessage(error.message, true)
        return
    }

    // Check if MFA is required
    if (data?.session?.user?.factors?.length > 0 || mfaCode) {
        await handleMFA(mfaCode)
        return
    }

    // Check for MFA challenge
    const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (mfaData?.nextLevel === 'aal2') {
        document.getElementById('mfaLabel').style.display = 'block'
        document.getElementById('mfaCode').style.display = 'block'
        showMessage('Enter your 6-digit authenticator code to continue.')
        return
    }

    showMessage('Signed in! Redirecting...')
    setTimeout(() => { window.location.href = 'app.html' }, 800)
}

// ── MFA Handler ──
const handleMFA = async (code) => {
    if (!code) {
        showMessage('Please enter your authenticator code.', true)
        return
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: (await supabase.auth.mfa.listFactors()).data.totp[0].id
    })

    if (challengeError) {
        showMessage(challengeError.message, true)
        return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: (await supabase.auth.mfa.listFactors()).data.totp[0].id,
        challengeId: challengeData.id,
        code
    })

    if (verifyError) {
        showMessage('Invalid code. Please try again.', true)
        return
    }

    showMessage('Verified! Redirecting...')
    setTimeout(() => { window.location.href = 'app.html' }, 800)
}

// ── Signup ──
window.handleSignup = async () => {
    const name = document.getElementById('signupName').value.trim()
    const email = document.getElementById('signupEmail').value.trim()
    const password = document.getElementById('signupPassword').value
    const confirm = document.getElementById('signupConfirm').value

    if (!name || !email || !password || !confirm) {
        showMessage('Please fill in all fields.', true)
        return
    }

    if (password.length < 10) {
        showMessage('Password must be at least 10 characters.', true)
        return
    }

    if (password !== confirm) {
        showMessage('Passwords do not match.', true)
        return
    }

    showMessage('Creating your account...')

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { display_name: name }
        }
    })

    if (error) {
        showMessage(error.message, true)
        return
    }

    showMessage('Account created! Check your email to confirm before signing in.')
}

// ── Forgot Password ──
window.showForgotPassword = async () => {
    const email = document.getElementById('loginEmail').value.trim()

    if (!email) {
        showMessage('Enter your email address above first.', true)
        return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html'
    })

    if (error) {
        showMessage(error.message, true)
        return
    }

    showMessage('Password reset email sent. Check your inbox.')
}

// ── Auto redirect if already logged in ──
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = 'app.html'
})