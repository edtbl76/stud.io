import { gatedTbt } from '../../lib/tbtGate'

const LIMIT = 200

describe('gatedTbt()', () => {
  it('passes a first reading under the limit without re-measuring', async () => {
    const remeasure = jest.fn()
    const r = await gatedTbt(150, LIMIT, remeasure)
    expect(r).toEqual({ tbt: 150, samples: [150] })
    expect(remeasure).not.toHaveBeenCalled()
  })

  it('re-measures a miss twice and judges the median: a one-off spike passes', async () => {
    const remeasure = jest.fn().mockResolvedValueOnce(60).mockResolvedValueOnce(70)
    const r = await gatedTbt(621, LIMIT, remeasure)
    expect(remeasure).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ tbt: 70, samples: [621, 60, 70] })
    expect(r.tbt).toBeLessThan(LIMIT)
  })

  it('a real regression still fails: two of three readings over the limit', async () => {
    const remeasure = jest.fn().mockResolvedValueOnce(240).mockResolvedValueOnce(90)
    const r = await gatedTbt(230, LIMIT, remeasure)
    expect(r.tbt).toBe(230)
    expect(r.tbt).toBeGreaterThanOrEqual(LIMIT)
  })

  it('a reading of exactly the limit is a miss (the gate is strict <)', async () => {
    const remeasure = jest.fn().mockResolvedValueOnce(200).mockResolvedValueOnce(200)
    const r = await gatedTbt(200, LIMIT, remeasure)
    expect(remeasure).toHaveBeenCalledTimes(2)
    expect(r.tbt).toBe(200)
  })

  it('fails safe when audits report nothing: Infinity in two of three stays a failure', async () => {
    const remeasure = jest.fn().mockResolvedValueOnce(Infinity).mockResolvedValueOnce(50)
    const r = await gatedTbt(Infinity, LIMIT, remeasure)
    expect(r.tbt).toBe(Infinity)
  })

  it('propagates a re-measure error instead of passing', async () => {
    const remeasure = jest.fn().mockRejectedValue(new Error('PAGE_HUNG'))
    await expect(gatedTbt(400, LIMIT, remeasure)).rejects.toThrow('PAGE_HUNG')
  })
})
