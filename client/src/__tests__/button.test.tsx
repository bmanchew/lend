
import { render, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { describe, it, expect, vi } from 'vitest'

describe('Button', () => {
  it('renders correctly', () => {
    const { getByRole } = render(<Button>Click me</Button>)
    expect(getByRole('button')).toHaveTextContent('Click me')
  })

  it('handles clicks', () => {
    const handleClick = vi.fn()
    const { getByRole } = render(
      <Button onClick={handleClick}>Click me</Button>
    )
    fireEvent.click(getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    const handleClick = vi.fn()
    const { getByRole } = render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>
    )
    const button = getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('applies variant classes correctly', () => {
    const { getByRole } = render(
      <Button variant="destructive">Delete</Button>
    )
    const button = getByRole('button')
    expect(button.className).toContain('bg-destructive')
  })
})
