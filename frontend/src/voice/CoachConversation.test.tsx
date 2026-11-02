import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CoachConversation from './CoachConversation'
import { showCoachText } from './coachVoice'
import { recordVoiceTiming } from './voiceTimings'

describe('coach dock', () => {
  it('shows the latest line, keeps earlier lines expandable, and labels only real Meta lines', () => {
    showCoachText('A Spark-generated earlier line.', 'meta-spark')
    showCoachText('The current deterministic line.', 'deterministic')
    recordVoiceTiming({
      stage: 'reality-build',
      speechToTranscriptMs: 412,
      transcriptToCoachReplyMs: 286,
      transcript: 'Um, no, the open switch keeps it dark.',
    })

    const markup = renderToStaticMarkup(
      <CoachConversation
        enabled={false}
        onEnabledChange={() => undefined}
        learnerText="Um, no, the open switch keeps it dark."
        onLearnerTextChange={() => undefined}
      />,
    )

    expect(markup).toContain('The current deterministic line.')
    expect(markup).toContain('Earlier')
    expect(markup).toContain('A Spark-generated earlier line.')
    const currentLine = markup.slice(
      markup.indexOf('The current deterministic line.'),
      markup.indexOf('</p>', markup.indexOf('The current deterministic line.')),
    )
    expect(currentLine).not.toContain('Meta Spark')
    expect(markup).toContain('Meta Spark')
    expect(markup).toContain('Reply by voice')
    expect(markup).toContain('Browser voice, not Meta')
    expect(markup).toContain('Heard:</span> No, the open switch keeps it dark.')
    expect(markup.match(/Heard:/g)).toHaveLength(1)
    // Timings, stage labels, and raw words live in Trace, not the dock.
    expect(markup).not.toContain('Voice timings')
    expect(markup).not.toContain('reality-build')
    expect(markup).not.toContain('412 ms')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).not.toContain('Coach conversation')
  })
})
