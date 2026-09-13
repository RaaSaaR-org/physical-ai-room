import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const episode = JSON.parse(readFileSync('public/data/episode-000000.json', 'utf8'))
const debug = (page: Page) => page.evaluate(() => (window as any).__roomDebug())
const ready = async (page: Page) => {
  await page.goto('./')
  await page.waitForFunction(() => (window as any).__roomDebug?.().ready)
}
const seek = async (page: Page, t: number) => {
  await page.locator('#timeline').evaluate((input, t) => {
    ;(input as HTMLInputElement).value = String(t)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, t)
  await expect.poll(async () => (await debug(page)).time).toBeCloseTo(t, 3)
}

test('source episode preserves the complete measured joint layout', () => {
  const layout = JSON.parse(readFileSync('public/data/joint-layout.json', 'utf8'))
  const groups = [
    'left_leg',
    'right_leg',
    'waist',
    'left_arm',
    'right_arm',
    'left_hand',
    'right_hand',
  ]
  expect(episode.jointNames).toEqual(groups.flatMap((g) => layout.state[g]))
  expect(episode.actionJointNames).toEqual(groups.flatMap((g) => layout.action[g]))
  expect(episode.actionJointNames.slice(29, 36)).not.toEqual(episode.jointNames.slice(29, 36))
  expect(episode.frames).toHaveLength(590)
  for (let i = 0; i < episode.frames.length; i++) {
    const f = episode.frames[i]
    expect(f.q).toHaveLength(43)
    expect(f.a).toHaveLength(43)
    expect([...f.q, ...f.a, f.t].every(Number.isFinite)).toBe(true)
    if (i) expect(f.t).toBeGreaterThan(episode.frames[i - 1].t)
  }
  expect(episode.frames[0].q[15]).toBe(-0.390794)
})

test('Pages prefix loads all local assets and the 43-joint model without errors', async ({
  page,
}) => {
  const errors: string[] = []
  const failures: string[] = []
  const external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url())
  })
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:4178/physical-ai-room/') &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      external.push(request.url())
  })
  await ready(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A small task.')
  expect((await debug(page)).joints).toBe(43)
  await page.waitForFunction(() => document.querySelector('video')!.readyState >= 2)
  expect(errors).toEqual([])
  expect(failures).toEqual([])
  expect(external).toEqual([])
})

test('scrubbing drives measured joints, synchronized video and reconstructed placement', async ({
  page,
}) => {
  await ready(page)
  await seek(page, 7)
  await expect(page.locator('#phase-badge')).toHaveText('Grasp')
  await expect.poll(async () => Math.abs((await debug(page)).videoTime - 7)).toBeLessThan(0.15)
  const mid = await debug(page)
  expect(mid.apple).not.toEqual(mid.pickup)
  // Actual local rotations must reflect the dataset, not a hand-authored animation.
  for (let i = 0; i < 43; i++) {
    const q = mid.jointRotations[i]
    const angle = episode.frames[mid.frame].q[q.column]
    expect(Math.abs(q.relative[3])).toBeCloseTo(Math.abs(Math.cos(angle / 2)), 2)
  }
  await seek(page, episode.duration)
  const end = await debug(page)
  expect(end.frame).toBe(589)
  expect(end.apple).toEqual(end.destination)
  await page.locator('#restart-button').click()
  expect((await debug(page)).time).toBe(0)
})

test('playback pauses, changes speed, loops and supports keyboard seeking', async ({ page }) => {
  await ready(page)
  await page.locator('#play-button').click()
  await expect.poll(async () => (await debug(page)).time).toBeGreaterThan(0.3)
  await page.getByRole('button', { name: 'Pause demonstration' }).click()
  const paused = (await debug(page)).time
  await page.waitForTimeout(180)
  expect((await debug(page)).time).toBe(paused)
  await page.locator('#speed-button').click()
  await expect(page.locator('#speed-button')).toHaveText('0.5×')
  await page.locator('#loop-button').click()
  await seek(page, episode.duration - 0.05)
  await page.locator('#play-button').click()
  await expect.poll(async () => (await debug(page)).time).toBeLessThan(2)
  await page.locator('#play-button').click()
  await page.locator('h1').click()
  await page.keyboard.press('ArrowRight')
  expect((await debug(page)).time).toBeGreaterThan(1)
})

test('the full replay clears the table and the fingers surround the apple during grasp', async ({
  page,
}) => {
  await ready(page)
  const sampleTimes = episode.frames.flatMap((frame: { t: number }, i: number) =>
    i ? [(episode.frames[i - 1].t + frame.t) / 2, frame.t] : [frame.t],
  )
  const result = await page.evaluate((times) => {
    const input = document.querySelector<HTMLInputElement>('#timeline')!
    let clearance = Infinity
    let appleClearance = Infinity
    let skinGap = Infinity
    let pinchGap = 0
    let threeFingerGap = 0
    const collisions: unknown[] = []
    for (const time of times) {
      input.value = String(time)
      input.dispatchEvent(new Event('input'))
      const d = (window as any).__roomDebug()
      clearance = Math.min(clearance, d.handClearance)
      appleClearance = Math.min(appleClearance, d.apple[1] - d.appleHalfHeight - d.tabletop)
      skinGap = Math.min(skinGap, ...d.graspContacts.map((c: any) => c.surfaceGap))
      if (d.tableIntersections.length) collisions.push({ time, parts: d.tableIntersections })
      if (time >= 6.6 && time <= 10)
        pinchGap = Math.max(
          pinchGap,
          ...d.graspContacts
            .filter((c: any) => /thumb|index/.test(c.finger))
            .map((c: any) => c.surfaceGap),
        )
      if (time >= 7.8 && time <= 10)
        threeFingerGap = Math.max(threeFingerGap, ...d.graspContacts.map((c: any) => c.surfaceGap))
    }
    return { clearance, appleClearance, skinGap, pinchGap, threeFingerGap, collisions }
  }, sampleTimes)
  // Triangle/box intersection catches surfaces crossing a table edge, even
  // when neither endpoint is inside. Skin checks use the apple ellipsoid.
  expect(result.collisions).toEqual([])
  expect(result.clearance).toBeGreaterThan(0.006)
  expect(result.appleClearance).toBeGreaterThanOrEqual(-1e-6)
  expect(result.skinGap).toBeGreaterThan(-0.0003)
  expect(result.pinchGap).toBeLessThan(0.006)
  expect(result.threeFingerGap).toBeLessThan(0.003)
  await seek(page, 6.6)
  const grasp = await debug(page)
  expect(
    Math.hypot(...grasp.apple.map((v: number, i: number) => v - grasp.pickup[i])),
  ).toBeLessThan(0.001)
  await seek(page, 12)
  const placed = await debug(page)
  expect(placed.apple).toEqual(placed.destination)
  expect(placed.apple[1] - placed.appleHalfHeight - placed.tabletop).toBeCloseTo(0.006, 5)
})

test('the grasp close-up shows pickup, carry, release and placement', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Close-up grasp camera view' }).click()
  await expect(page.locator('#grasp-view')).toHaveClass(/active/)
  // Keep real browser renders as review artifacts, alongside the synced RGB.
  for (const [label, time] of [
    ['pickup', 6.6],
    ['carry', 8.5],
    ['release', 10.4],
    ['placed', 12],
  ] as const) {
    await seek(page, time)
    await expect.poll(async () => Math.abs((await debug(page)).videoTime - time)).toBeLessThan(0.15)
    await page.screenshot({ path: `.cache/validated-${label}.png` })
  }
  await page.getByRole('button', { name: 'Orbit camera view', exact: true }).click()
  await expect(page.locator('#orbit-view')).toHaveClass(/active/)
})

test('frame inspector aligns measured states with differently ordered hand targets', async ({
  page,
}) => {
  await ready(page)
  await seek(page, 3)
  await page.locator('#inspect-frame').click()
  await expect(page.locator('.frame-table tbody tr')).toHaveCount(43)
  const row = page.locator('.frame-table tbody tr').filter({ hasText: 'left_hand_thumb_0' })
  const f = episode.frames[(await debug(page)).frame]
  await expect(row.locator('td').nth(1)).toHaveText(f.q[29].toFixed(4))
  await expect(row.locator('td').nth(2)).toHaveText(
    f.a[episode.actionJointNames.indexOf('left_hand_thumb_0_joint')].toFixed(4),
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('#guide-dialog')).not.toBeVisible()
})

test('each learning station has working explanatory interactions', async ({ page }) => {
  await ready(page)
  await page.locator('.station-tab[data-station="0"]').click()
  await page.locator('[data-collect="1"]').click()
  await expect(page.locator('#collect-detail')).toContainText('commanded joint targets')
  await page.locator('.station-tab[data-station="1"]').click()
  await page.locator('[data-input="vision"]').click()
  await expect(page.locator('#vla-explanation')).toContainText('Without vision')
  await page.locator('.station-tab[data-station="2"]').click()
  await page.locator('[data-hardware="sim"]').click()
  await expect(page.locator('#hardware-detail')).toContainText('RT cores')
  await page.locator('#train-steps').fill('8000')
  await expect(page.locator('#steps-value')).toHaveText('8,000 steps')
  await page.locator('.station-tab[data-station="3"]').click()
  await page.locator('#step-inference').click()
  await expect(page.locator('#inference-detail')).toContainText('Predict:')
  await page.locator('.station-tab[data-station="4"]').click()
  await page.locator('[data-future="miss"]').click()
  await expect(page.locator('[data-future="miss"]')).toHaveClass('active')
  await page.screenshot({ path: '.cache/test-future.png', fullPage: true })
})

test('mobile remains within the viewport and supports all lesson navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  for (let i = 0; i < 5; i++) {
    await page.locator(`.station-tab[data-station="${i}"]`).click()
    expect((await debug(page)).station).toBe(i)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  }
  await page.screenshot({ path: '.cache/test-mobile.png', fullPage: true })
})

test('unavailable VR and failed model requests give useful fallbacks', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true }),
  )
  await ready(page)
  await page.locator('#vr-button').click()
  await expect(page.locator('#guide-dialog')).toContainText('Visit from your headset')
  await page.keyboard.press('Escape')
  await page.route('**/g1-dex3.glb', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.reload()
  await expect(page.locator('#loading')).toContainText('The 3D room could not load')
  await page.locator('.station-tab[data-station="2"]').click()
  await expect(page.locator('#hardware-detail')).toContainText('48+')
})

test('dataset explorer aligns three real episodes, hand targets and training boundaries', async ({
  page,
}) => {
  await ready(page)
  await page.getByRole('button', { name: 'Discover datasets', exact: true }).first().click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0 / 589')
  await page.locator('#dataset-joint').selectOption('29')
  const expected = episode.frames[0].a[episode.actionJointNames.indexOf(episode.jointNames[29])]
  await expect(page.locator('#dataset-action')).toHaveText(expected.toFixed(4) + ' rad')
  await page.locator('#dataset-timeline').fill('210')
  await expect(page.locator('#dataset-frame')).toContainText('Frame 210 / 589 · 7.000 s')
  await page.locator('[data-explore="training"]').click()
  await expect(page.locator('.dataset-chunk-grid > div')).toHaveCount(16)
  await expect(page.locator('.dataset-chunk-grid strong').first()).toHaveText(
    episode.frames[210].a[episode.actionJointNames.indexOf(episode.jointNames[29])].toFixed(3),
  )
  await page.locator('#dataset-timeline').fill('589')
  await expect(page.locator('.dataset-chunk-grid > div')).toHaveCount(1)
  await expect(page.locator('#dataset-chunk-note')).toContainText('Episode boundary')
  await expect(page.locator('#dataset-next')).toBeDisabled()
  for (const [id, length] of [
    [1, 535],
    [2, 478],
  ]) {
    await page.locator(`[data-episode="${id}"]`).click()
    await expect(page.locator('#dataset-frame')).toContainText(`Frame 0 / ${length - 1}`)
    await expect(page.locator('#dataset-video')).toHaveAttribute(
      'src',
      new RegExp(`episode-00000${id}.mp4`),
    )
    await page.waitForFunction(
      () => (document.querySelector('#dataset-video') as HTMLVideoElement).readyState >= 2,
    )
  }
  await page.locator('[data-explore="files"]').click()
  await page.getByText('data/ → What the robot did', { exact: true }).click()
  await expect(page.locator('#dataset-detail')).toContainText('Parquet')
  await page.locator('[data-dataset="sim"]').click()
  await expect(page.locator('.dataset-sim')).toContainText('This card is a guide')
  await expect(page.getByRole('link', { name: 'Explore simulation dataset' })).toHaveAttribute(
    'href',
    /Arena-G1/,
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('#dataset-dialog')).not.toBeVisible()
})

test('dataset explorer stays local, supports mobile and returns a moment to the room', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4178/'))
      external.push(r.url())
  })
  await page.getByRole('button', { name: 'Discover datasets', exact: true }).first().click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0')
  expect(
    await page.locator('#dataset-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  await page.locator('#dataset-timeline').fill('240')
  await page.locator('#dataset-joint').selectOption('35')
  await page.screenshot({ path: '.cache/dataset-mobile.png' })
  await page.locator('#dataset-replay').click()
  expect((await debug(page)).time).toBeCloseTo(8, 3)
  expect((await debug(page)).playing).toBe(false)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: 'Discover datasets', exact: true }).first().click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0')
  await page.locator('#dataset-timeline').fill('240')
  await page.screenshot({ path: '.cache/dataset-desktop.png' })
  await page.locator('#dataset-title').click()
  await page.keyboard.press('Space')
  expect((await debug(page)).playing).toBe(false)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('failed episode requests can be retried and rapid selection keeps the latest episode', async ({
  page,
}) => {
  await ready(page)
  await page.route('**/data/episode-000001.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.getByRole('button', { name: 'Discover datasets', exact: true }).first().click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0')
  await page.locator('[data-episode="1"]').click()
  await expect(page.getByRole('alert')).toHaveText('This episode could not load.')
  await page.unroute('**/data/episode-000001.json')
  await page.locator('#dataset-retry').click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0 / 534')
  await page.locator('[data-episode="2"]').click()
  await page.locator('[data-episode="0"]').click()
  await expect(page.locator('#dataset-frame')).toContainText('Frame 0 / 589')
})

test('illustrative operator follows replay with fixed arm lengths and synchronized fingers', async ({
  page,
}) => {
  await ready(page)
  expect((await debug(page)).teleoperator.visible).toBe(false)
  await page.locator('.station-tab[data-station="0"]').click()
  const start = await debug(page)
  expect(start.teleoperator.visible).toBe(true)
  expect(start.teleoperator.body).toBe('skinned-human')
  expect(start.teleoperator.illustrative).toBe(true)
  await seek(page, 8.5)
  const grasp = await debug(page)
  expect(grasp.teleoperator.wrists).not.toEqual(start.teleoperator.wrists)
  expect(grasp.teleoperator.fingerCurl).toBeGreaterThan(start.teleoperator.fingerCurl + 0.5)
  for (const time of [0, 3, 6.6, 8.5, 12, 19]) {
    await seek(page, time)
    const d = await debug(page)
    for (const [i, lengths] of d.teleoperator.armLengths.entries()) {
      expect(lengths[0]).toBeCloseTo(start.teleoperator.armLengths[i][0], 5)
      expect(lengths[1]).toBeCloseTo(start.teleoperator.armLengths[i][1], 5)
    }
    expect(d.teleoperator.wrists.flat().every(Number.isFinite)).toBe(true)
  }
  await seek(page, 8.5)
  await page.screenshot({ path: '.cache/validated-teleoperation.png' })
  await page.locator('#teleop-toggle').click()
  const hidden = await debug(page)
  expect(hidden.teleoperator.visible).toBe(false)
  expect(hidden.jointRotations).toEqual(grasp.jointRotations)
  expect(hidden.apple).toEqual(grasp.apple)
  await page.locator('#teleop-toggle').click()
  expect((await debug(page)).teleoperator.visible).toBe(true)
})

test('teleoperation lesson highlights tracking, retargeting and demonstration capture', async ({
  page,
}) => {
  await ready(page)
  await page.locator('.station-tab[data-station="0"]').click()
  await page.locator('[data-teleop-stage="1"]').click()
  await expect(page.locator('#teleop-explanation')).toContainText('five-fingered human hand')
  expect((await debug(page)).teleoperator.stage).toBe(1)
  await page.locator('[data-teleop-stage="2"]').click()
  await expect(page.locator('#teleop-explanation')).toContainText('commanded action targets')
  expect((await debug(page)).teleoperator.stage).toBe(2)
  await page.locator('[data-teleop-stage="0"]').click()
  await expect(page.locator('#teleop-explanation')).toContainText('reconstructed')
  await page.locator('#watch-teleop').click()
  await expect.poll(async () => (await debug(page)).playing).toBe(true)
  await page.locator('#play-button').click()
  expect((await debug(page)).time).toBeGreaterThanOrEqual(2.5)
  await page.locator('.teleop-lesson').screenshot({ path: '.cache/validated-teleop-lesson.png' })
})

test('overview opens robot-only and the operator is confined to collection', async ({ page }) => {
  await ready(page)
  expect((await debug(page)).station).toBe(-1)
  expect((await debug(page)).teleoperator.visible).toBe(false)
  await expect(page.locator('#teleop-toggle')).toBeHidden()
  await expect(page.locator('#overview-play')).toBeInViewport()
  await page.locator('#overview-collect').click()
  expect((await debug(page)).teleoperator.visible).toBe(true)
  await expect(page.locator('#watch-teleop')).toBeInViewport()
  for (const index of [1, 2, 3, 4, -1]) {
    await page.locator(`.station-tab[data-station="${index}"]`).click()
    expect((await debug(page)).teleoperator.visible).toBe(false)
    await expect(page.locator('#teleop-toggle')).toBeHidden()
    await expect(page.locator('#lesson-title')).toBeInViewport()
    expect(await page.locator('.lesson-sidebar').evaluate((el) => el.scrollTop)).toBe(0)
  }
})

test('lesson switching reveals readings on mobile and controls remain beside their content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await page.locator('.station-tab[data-station="1"]').click()
  await expect(page.locator('#lesson-title')).toBeInViewport()
  await expect(page.locator('[data-input="vision"]')).toBeInViewport()
  expect(
    await page.locator('.station-tabs').evaluate((el) => el.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const rectangles = await page.evaluate(() => ({
    reading: document.querySelector('.lesson-sidebar')!.getBoundingClientRect().top,
    signals: document.querySelector('.observation-card')!.getBoundingClientRect().bottom,
  }))
  expect(rectangles.signals).toBeLessThanOrEqual(rectangles.reading + 1)
  await page.screenshot({ path: '.cache/validated-mobile-reading.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.station-tab[data-station="2"]').click()
  await expect(page.locator('[data-hardware="train"]')).toBeInViewport()
  await page.locator('[data-hardware="sim"]').click()
  await expect(page.locator('#hardware-detail')).toBeInViewport()
  await expect(page.locator('#hardware-detail')).toContainText('RT cores')
  await page.screenshot({ path: '.cache/validated-integrated-reading.png' })
})
