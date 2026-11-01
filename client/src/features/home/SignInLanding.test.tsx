import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SignInLanding } from './SignInLanding'

describe('focused sign-in entry', () => {
  it('keeps all three actions accessible and delegates to the existing auth flow', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn()
    const signUp = vi.fn()
    const back = vi.fn()
    render(<SignInLanding onSignIn={signIn} onSignUp={signUp} onBack={back} />)
    expect(screen.getByRole('heading', { name: 'Your next run starts here.' })).toBeInTheDocument()
    expect(screen.queryByText(/Sign-in is handled securely/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to sign in' }))
    await user.click(screen.getByRole('button', { name: 'Create an account' }))
    await user.click(screen.getByRole('button', { name: 'Back to Taperday' }))
    expect(signIn).toHaveBeenCalledOnce()
    expect(signUp).toHaveBeenCalledOnce()
    expect(back).toHaveBeenCalledOnce()
  })
})
