import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HealthStatus from './HealthStatus'

describe('HealthStatus', () => {
  it('starts the health check as soon as the hub renders', () => {
    const markup = renderToStaticMarkup(<HealthStatus />)

    expect(markup).toContain('Checking backend…')
  })

  it('stays silent while checking or ready when hideWhenReady is set', () => {
    const markup = renderToStaticMarkup(<HealthStatus hideWhenReady />)

    expect(markup).toBe('')
  })
})
