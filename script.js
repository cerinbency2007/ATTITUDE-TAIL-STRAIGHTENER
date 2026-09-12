/**
 * ATTITUDE TAIL STRAIGHTENER
 * Interactive simulation engine, physics, Web Audio synthesizer, and state sequencer.
 */

(function () {
  'use strict';

  // ==========================================
  // 1. STATE & TELEMETRY
  // ==========================================
  const state = {
    attempts: 0,
    straightness: 0, // 0.0 (curled) to 1.0 (straight)
    servoAngle: 0,   // 0 to 180 degrees
    forceN: 4500,
    pipeYears: 12,
    clampingMode: 'rigorous',
    currentStage: 0, // 0: Idle, 1: Detected, 2: Applying, 3: Straightening, 4: Fixed
    isBusy: false,
    soundEnabled: true,
    animationFrameId: null
  };

  // SVG Elements & Paths
  const tailShadowPath = document.getElementById('tail-shadow-path');
  const tailMainPath = document.getElementById('tail-main-path');
  const tailCorePath = document.getElementById('tail-core-path');
  const tailTipFluff = document.getElementById('tail-tip-fluff');
  const servoWheel = document.getElementById('servo-wheel');
  const linkageArm = document.getElementById('linkage-arm');
  const clampTop = document.getElementById('clamp-top');
  const clampBottom = document.getElementById('clamp-bottom');
  const laserGuide = document.getElementById('laser-guide');
  const svgLaserGuide = document.getElementById('svg-laser-guide');
  const scannerBeam = document.getElementById('scanner-beam');
  const sparksLayer = document.getElementById('sparks-layer');
  const chamberLamp = document.getElementById('chamber-lamp');
  const liveRigStatus = document.getElementById('live-rig-status');
  const actionBanner = document.getElementById('action-banner');

  // Dog facial expression elements
  const dogTongue = document.getElementById('dog-tongue');
  const dogEyeLeft = document.getElementById('dog-eye-left');
  const dogEyeRight = document.getElementById('dog-eye-right');

  // Floating Rig Badges
  const rigAttitudeBadge = document.getElementById('rig-attitude-badge');
  const rigAttitudeText = document.getElementById('rig-attitude-text');
  const rigTorqueText = document.getElementById('rig-torque-text');

  // HUD Elements
  const hudAttemptsVal = document.getElementById('hud-attempts-val');
  const hudAttitudeVal = document.getElementById('hud-attitude-val');
  const hudAttitudeSub = document.getElementById('hud-attitude-sub');
  const hudStraightnessVal = document.getElementById('hud-straightness-val');
  const hudStraightnessSub = document.getElementById('hud-straightness-sub');
  const hudForceVal = document.getElementById('hud-force-val');
  const hudForceSub = document.getElementById('hud-force-sub');

  // Interactive Controls
  const btnStraighten = document.getElementById('btn-straighten');
  const btnReset = document.getElementById('btn-reset');
  const btnRealityCheck = document.getElementById('btn-reality-check');
  const servoAngleSlider = document.getElementById('servo-angle-slider');
  const servoAngleDisplay = document.getElementById('servo-angle-display');
  const forceSlider = document.getElementById('force-slider');
  const forceValDisplay = document.getElementById('force-val-display');
  const pipeSlider = document.getElementById('pipe-slider');
  const pipeValDisplay = document.getElementById('pipe-val-display');
  const modePills = document.querySelectorAll('.mode-pill');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundIcon = document.getElementById('sound-icon');
  const soundText = document.getElementById('sound-text');

  // ==========================================
  // 2. MATHEMATICAL TAIL INTERPOLATION
  // ==========================================
  // Base curled tail points (t = 0):
  // "M 355 265 C 410 260 450 160 410 130 C 380 110 340 160 380 190"
  // Target perfectly straight tail points (t = 1):
  // "M 355 265 C 430 265 490 265 530 265 C 550 265 565 265 575 265"

  const CURLED_POINTS = {
    p0: { x: 355, y: 265 },
    c1: { x: 410, y: 260 },
    c2: { x: 450, y: 160 },
    p1: { x: 410, y: 130 },
    c3: { x: 380, y: 110 },
    c4: { x: 340, y: 160 },
    p2: { x: 380, y: 190 }
  };

  const STRAIGHT_POINTS = {
    p0: { x: 355, y: 265 },
    c1: { x: 430, y: 265 },
    c2: { x: 490, y: 265 },
    p1: { x: 530, y: 265 },
    c3: { x: 550, y: 265 },
    c4: { x: 565, y: 265 },
    p2: { x: 575, y: 265 }
  };

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function updateTailGeometry(t) {
    // Clamp t between 0 and 1
    const clampedT = Math.max(0, Math.min(1, t));

    const p0x = lerp(CURLED_POINTS.p0.x, STRAIGHT_POINTS.p0.x, clampedT);
    const p0y = lerp(CURLED_POINTS.p0.y, STRAIGHT_POINTS.p0.y, clampedT);

    const c1x = lerp(CURLED_POINTS.c1.x, STRAIGHT_POINTS.c1.x, clampedT);
    const c1y = lerp(CURLED_POINTS.c1.y, STRAIGHT_POINTS.c1.y, clampedT);

    const c2x = lerp(CURLED_POINTS.c2.x, STRAIGHT_POINTS.c2.x, clampedT);
    const c2y = lerp(CURLED_POINTS.c2.y, STRAIGHT_POINTS.c2.y, clampedT);

    const p1x = lerp(CURLED_POINTS.p1.x, STRAIGHT_POINTS.p1.x, clampedT);
    const p1y = lerp(CURLED_POINTS.p1.y, STRAIGHT_POINTS.p1.y, clampedT);

    const c3x = lerp(CURLED_POINTS.c3.x, STRAIGHT_POINTS.c3.x, clampedT);
    const c3y = lerp(CURLED_POINTS.c3.y, STRAIGHT_POINTS.c3.y, clampedT);

    const c4x = lerp(CURLED_POINTS.c4.x, STRAIGHT_POINTS.c4.x, clampedT);
    const c4y = lerp(CURLED_POINTS.c4.y, STRAIGHT_POINTS.c4.y, clampedT);

    const p2x = lerp(CURLED_POINTS.p2.x, STRAIGHT_POINTS.p2.x, clampedT);
    const p2y = lerp(CURLED_POINTS.p2.y, STRAIGHT_POINTS.p2.y, clampedT);

    const pathData = `M ${p0x.toFixed(1)} ${p0y.toFixed(1)} ` +
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
      `C ${c3x.toFixed(1)} ${c3y.toFixed(1)} ${c4x.toFixed(1)} ${c4y.toFixed(1)} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;

    tailShadowPath.setAttribute('d', pathData);
    tailMainPath.setAttribute('d', pathData);
    tailCorePath.setAttribute('d', pathData);

    // Fluff position
    tailTipFluff.setAttribute('cx', p2x.toFixed(1));
    tailTipFluff.setAttribute('cy', p2y.toFixed(1));

    // Dynamic coloring based on straightness
    if (clampedT > 0.85) {
      tailMainPath.style.stroke = '#0ea5e9';
      tailCorePath.style.stroke = '#38bdf8';
    } else {
      tailMainPath.style.stroke = '#ea580c';
      tailCorePath.style.stroke = '#fb923c';
    }

    // Update Rig Mechanics: Servo Horn & Clamps
    const angle = clampedT * 180;
    servoWheel.setAttribute('transform', `translate(45, 0) rotate(${angle.toFixed(1)})`);

    // Linkage rod endpoints
    const rad = (angle - 90) * (Math.PI / 180);
    const hornTipX = 45 + Math.cos(rad) * 24;
    const hornTipY = Math.sin(rad) * 24;
    linkageArm.setAttribute('x1', hornTipX.toFixed(1));
    linkageArm.setAttribute('y1', hornTipY.toFixed(1));

    // Clamps squeeze in as tail straightens
    const clampSqueeze = clampedT * 14;
    clampTop.setAttribute('transform', `translate(0, ${clampSqueeze.toFixed(1)})`);
    clampBottom.setAttribute('transform', `translate(0, -${clampSqueeze.toFixed(1)})`);

    // Update floating badges
    const currentTorque = (clampedT * (state.forceN / 450)).toFixed(1);
    rigTorqueText.textContent = `${currentTorque} kg·cm`;

    if (clampedT >= 0.99) {
      rigAttitudeBadge.classList.add('fixed');
      rigAttitudeText.textContent = '0% (RECTIFIED)';
      laserGuide.classList.add('active');
      if (svgLaserGuide) svgLaserGuide.style.opacity = '1';
    } else {
      rigAttitudeBadge.classList.remove('fixed');
      const sassPercent = ((1 - clampedT) * 99.9).toFixed(1);
      rigAttitudeText.textContent = `${sassPercent}% (CURLED)`;
      laserGuide.classList.remove('active');
      if (svgLaserGuide) svgLaserGuide.style.opacity = '0';
    }
  }

  // ==========================================
  // 3. PROCEDURAL WEB AUDIO SYNTHESIZER
  // ==========================================
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playScannerBeep(freq = 920, duration = 0.12) {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playServoHum(duration = 1.2) {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(440, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(280, ctx.currentTime + duration * 0.7);
      osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + duration);

      subOsc.type = 'square';
      subOsc.frequency.setValueAtTime(70, ctx.currentTime);

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + duration * 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      subOsc.start();
      osc.stop(ctx.currentTime + duration);
      subOsc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playPneumaticHiss() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const bufferSize = ctx.sampleRate * 0.25;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1400;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playSuccessChime() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.65);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playSproing() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      // Pitch vibrato / drop
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // ==========================================
  // 4. CELEBRATION CONFETTI ENGINE
  // ==========================================
  const confettiCanvas = document.getElementById('confetti-canvas');
  let confettiCtx = confettiCanvas.getContext('2d');
  let confettiParticles = [];
  let confettiAnimId = null;

  function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfetti);
  resizeConfetti();

  function triggerConfettiBurst() {
    const colors = ['#06b6d4', '#fbbf24', '#10b981', '#f43f5e', '#a855f7', '#38bdf8', '#ffffff'];
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.45;

    confettiParticles = [];
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 9 + 4;
      confettiParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: Math.random() * 12 - 6,
        gravity: 0.28,
        alpha: 1
      });
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    animateConfetti();
  }

  function animateConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = false;

    confettiParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotSpeed;
      p.alpha -= 0.012;

      if (p.alpha > 0) {
        alive = true;
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.globalAlpha = Math.max(0, p.alpha);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        confettiCtx.restore();
      }
    });

    if (alive) {
      confettiAnimId = requestAnimationFrame(animateConfetti);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  // ==========================================
  // 5. STAGE MANAGER & ANIMATION SEQUENCER
  // ==========================================
  function setStageBadge(activeStage) {
    for (let i = 1; i <= 4; i++) {
      const card = document.getElementById(`stage-${i}`);
      if (!card) continue;
      card.classList.remove('active', 'completed');
      if (i < activeStage) {
        card.classList.add('completed');
      } else if (i === activeStage) {
        card.classList.add('active');
      }
    }
  }

  // Active timer tracking to prevent race conditions
  let stageTimer1 = null;
  let stageTimer2 = null;

  function clearActiveTimers() {
    if (stageTimer1) {
      clearTimeout(stageTimer1);
      stageTimer1 = null;
    }
    if (stageTimer2) {
      clearTimeout(stageTimer2);
      stageTimer2 = null;
    }
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  }

  function startStraighteningSequence() {
    if (state.isBusy) return;
    clearActiveTimers();
    state.isBusy = true;
    btnStraighten.disabled = true;
    btnReset.disabled = true;
    btnRealityCheck.disabled = true;

    // Increment Attempt counter
    state.attempts++;
    hudAttemptsVal.textContent = state.attempts;

    // Reset visually first
    updateTailGeometry(0);
    servoAngleSlider.value = 0;
    servoAngleDisplay.textContent = '0°';
    laserGuide.classList.remove('active');
    if (svgLaserGuide) svgLaserGuide.style.opacity = '0';

    // Face: Playful & cheeky
    if (dogTongue) dogTongue.setAttribute('cy', '214');
    if (dogEyeLeft) dogEyeLeft.setAttribute('ry', '9');
    if (dogEyeRight) dogEyeRight.setAttribute('ry', '9');

    // ----------------------------------------------------
    // STAGE 1: Attitude Detected 😎
    // ----------------------------------------------------
    state.currentStage = 1;
    setStageBadge(1);
    chamberLamp.className = 'status-indicator-lamp correcting';
    liveRigStatus.textContent = 'SCANNING POSTURE & ATTITUDE VECTORS...';
    actionBanner.className = 'action-feedback-banner warning';
    actionBanner.textContent = 'Stage 1: Attitude Detected 😎 — Stubborn canine Fibonacci curl identified!';

    scannerBeam.classList.add('scanning');
    playScannerBeep(750, 0.15);
    setTimeout(() => playScannerBeep(1100, 0.18), 350);

    hudAttitudeVal.textContent = 'HIGH';
    hudAttitudeVal.className = 'telemetry-value high';
    hudAttitudeSub.textContent = 'Unapologetically Sassy';
    hudStraightnessVal.textContent = '0%';
    hudStraightnessSub.textContent = 'Pure Golden Spiral';
    hudForceVal.textContent = '0 N';

    // ----------------------------------------------------
    // STAGE 2: Applying Correction... (after 1000ms)
    // ----------------------------------------------------
    stageTimer1 = setTimeout(() => {
      state.currentStage = 2;
      setStageBadge(2);
      scannerBeam.classList.remove('scanning');
      sparksLayer.classList.add('visible');

      // Face: dog is alert / suspicious
      if (dogTongue) dogTongue.setAttribute('cy', '208');
      if (dogEyeLeft) dogEyeLeft.setAttribute('ry', '6');
      if (dogEyeRight) dogEyeRight.setAttribute('ry', '6');

      liveRigStatus.textContent = 'ENGAGING MG996R METAL-GEAR SERVO CALIPERS...';
      actionBanner.className = 'action-feedback-banner warning';
      actionBanner.textContent = 'Stage 2: Applying Correction... Calipers clamping with high mechanical torque!';

      playPneumaticHiss();
      playServoHum(1.8);

      hudAttitudeVal.textContent = 'RESISTING';
      hudAttitudeSub.textContent = 'Doggo is suspicious';
      hudForceVal.textContent = `${Math.floor(state.forceN * 0.4)} N`;
      hudForceSub.textContent = 'Hydraulic Engagement';

      // --------------------------------------------------
      // STAGE 3: Straightening... (after 1100ms more)
      // --------------------------------------------------
      stageTimer2 = setTimeout(() => {
        state.currentStage = 3;
        setStageBadge(3);

        liveRigStatus.textContent = 'STRAIGHTENING // OVERRIDING CANINE PHYSICS...';
        actionBanner.className = 'action-feedback-banner warning';
        actionBanner.textContent = 'Stage 3: Straightening... Linkage driving tail into 180° planar alignment!';

        playServoHum(1.5);

        // Smoothly animate straightness from 0 to 1 over 1600ms
        const startTime = performance.now();
        const duration = 1600;

        function animateStraightening(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(1, elapsed / duration);

          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          state.straightness = eased;
          updateTailGeometry(eased);

          // Update controls and telemetry in real time
          const currentDeg = Math.round(eased * 180);
          servoAngleSlider.value = currentDeg;
          servoAngleDisplay.textContent = `${currentDeg}°`;

          const currentForce = Math.round(eased * state.forceN);
          hudForceVal.textContent = `${currentForce.toLocaleString()} N`;

          const currentStraightnessPct = Math.round(eased * 100);
          hudStraightnessVal.textContent = `${currentStraightnessPct}%`;

          if (progress < 1) {
            state.animationFrameId = requestAnimationFrame(animateStraightening);
          } else {
            // ------------------------------------------------
            // STAGE 4: ATTITUDE FIXED ✅
            // ------------------------------------------------
            state.currentStage = 4;
            setStageBadge(4);
            sparksLayer.classList.remove('visible');
            laserGuide.classList.add('active');
            if (svgLaserGuide) svgLaserGuide.style.opacity = '1';

            // Face: dog is calm & rectified
            if (dogTongue) dogTongue.setAttribute('cy', '216');
            if (dogEyeLeft) dogEyeLeft.setAttribute('ry', '9');
            if (dogEyeRight) dogEyeRight.setAttribute('ry', '9');

            chamberLamp.className = 'status-indicator-lamp fixed';
            liveRigStatus.textContent = 'ATTITUDE FIXED // 180.0° LASER ALIGNED';
            actionBanner.className = 'action-feedback-banner success';
            actionBanner.textContent = 'Stage 4: ATTITUDE FIXED ✅ — The impossible has been straightened! Ancient Malayalam physics defied!';

            hudAttitudeVal.textContent = '0%';
            hudAttitudeVal.className = 'telemetry-value zero';
            hudAttitudeSub.textContent = 'Attitude Neutralized';

            hudStraightnessVal.textContent = '100%';
            hudStraightnessSub.textContent = 'Perfect Laser Alignment';

            hudForceVal.textContent = `${state.forceN.toLocaleString()} N`;
            hudForceSub.textContent = 'Stall Hold Active';

            playSuccessChime();
            triggerConfettiBurst();

            state.isBusy = false;
            btnStraighten.disabled = false;
            btnReset.disabled = false;
            btnRealityCheck.disabled = false;
          }
        }

        state.animationFrameId = requestAnimationFrame(animateStraightening);
      }, 1100);
    }, 1000);
  }

  // ==========================================
  // 6. TRY AGAIN & RESET FUNCTIONALITY
  // ==========================================
  function resetTail(withSound = true) {
    clearActiveTimers();
    state.isBusy = false;
    btnStraighten.disabled = false;
    btnReset.disabled = false;
    btnRealityCheck.disabled = false;

    state.currentStage = 0;
    setStageBadge(0);

    sparksLayer.classList.remove('visible');
    scannerBeam.classList.remove('scanning');
    laserGuide.classList.remove('active');
    if (svgLaserGuide) svgLaserGuide.style.opacity = '0';

    // Face: default happy dog
    if (dogTongue) dogTongue.setAttribute('cy', '214');
    if (dogEyeLeft) dogEyeLeft.setAttribute('ry', '9');
    if (dogEyeRight) dogEyeRight.setAttribute('ry', '9');

    chamberLamp.className = 'status-indicator-lamp ready';
    liveRigStatus.textContent = 'SYSTEM RESET // APPARATUS READY';
    actionBanner.className = 'action-feedback-banner';
    actionBanner.textContent = 'Apparatus reset to default calibration. Click "STRAIGHTEN THE TAIL" to run again.';

    // Animate smoothly back to bent curled position
    const startProgress = state.straightness;
    const startTime = performance.now();
    const duration = 500;

    if (withSound && startProgress > 0.1) {
      playSproing();
    }

    function animateReset(now) {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      const eased = Math.pow(1 - p, 2); // Ease in bounce-back
      state.straightness = startProgress * eased;
      updateTailGeometry(state.straightness);

      const deg = Math.round(state.straightness * 180);
      servoAngleSlider.value = deg;
      servoAngleDisplay.textContent = `${deg}°`;

      if (p < 1) {
        requestAnimationFrame(animateReset);
      } else {
        state.straightness = 0;
        updateTailGeometry(0);
        hudAttitudeVal.textContent = 'HIGH';
        hudAttitudeVal.className = 'telemetry-value high';
        hudAttitudeSub.textContent = 'Unapologetically Sassy';
        hudStraightnessVal.textContent = '0%';
        hudStraightnessSub.textContent = 'Pure Golden Spiral';
        hudForceVal.textContent = '0 N';
        hudForceSub.textContent = 'Standard Tension';
      }
    }

    requestAnimationFrame(animateReset);
  }

  // ==========================================
  // 7. COMICAL "MALAYALAM REALITY CHECK" (SPROING!)
  // ==========================================
  function triggerRealityCheck() {
    clearActiveTimers();
    state.isBusy = false;
    btnStraighten.disabled = false;
    btnReset.disabled = false;
    btnRealityCheck.disabled = false;

    playSproing();
    actionBanner.className = 'action-feedback-banner snap-back';
    actionBanner.textContent = '💥 MALAYALAM PROVERB REALITY CHECK: Even after 12 years in a pipe (പന്തീരാണ്ട് കൊല്ലം), the tail instantly snapped back! Attitude restored to 120%!';

    chamberLamp.className = 'status-indicator-lamp failed';
    liveRigStatus.textContent = 'ERROR 404: MALAYALAM PHYSICS INVARIANT ENFORCED';

    // Tail snaps back with overshoot!
    state.straightness = 0;
    updateTailGeometry(0);
    servoAngleSlider.value = 0;
    servoAngleDisplay.textContent = '0°';
    laserGuide.classList.remove('active');
    if (svgLaserGuide) svgLaserGuide.style.opacity = '0';

    // Face: comic shock/surprise eyes!
    if (dogTongue) dogTongue.setAttribute('cy', '218');
    if (dogEyeLeft) dogEyeLeft.setAttribute('ry', '11');
    if (dogEyeRight) dogEyeRight.setAttribute('ry', '11');

    hudAttitudeVal.textContent = 'MAX (120%)';
    hudAttitudeVal.className = 'telemetry-value high';
    hudAttitudeSub.textContent = 'Proverb Invariant Enforced';

    hudStraightnessVal.textContent = '0%';
    hudStraightnessSub.textContent = 'Eternal Curl Restored';

    hudForceVal.textContent = 'FAILED';
    hudForceSub.textContent = 'Ancient Wisdom > Servo';

    for (let i = 1; i <= 4; i++) {
      const card = document.getElementById(`stage-${i}`);
      if (card) card.classList.remove('active', 'completed');
    }
  }

  // ==========================================
  // 8. EVENT LISTENERS & MANUAL CONTROLS
  // ==========================================
  btnStraighten.addEventListener('click', startStraighteningSequence);
  btnReset.addEventListener('click', () => resetTail(true));
  btnRealityCheck.addEventListener('click', triggerRealityCheck);

  // Manual Servo Angle Slider
  servoAngleSlider.addEventListener('input', (e) => {
    if (state.isBusy) return;
    const val = parseInt(e.target.value, 10);
    servoAngleDisplay.textContent = `${val}°`;
    const progress = val / 180;
    state.straightness = progress;
    updateTailGeometry(progress);

    // Live update HUD based on manual slider
    const straightPct = Math.round(progress * 100);
    hudStraightnessVal.textContent = `${straightPct}%`;

    if (progress >= 0.95) {
      hudAttitudeVal.textContent = '0%';
      hudAttitudeVal.className = 'telemetry-value zero';
      hudAttitudeSub.textContent = 'Manual Rectification';
    } else {
      hudAttitudeVal.textContent = 'HIGH';
      hudAttitudeVal.className = 'telemetry-value high';
      hudAttitudeSub.textContent = 'Manual Override';
    }

    const forceEst = Math.round(progress * state.forceN);
    hudForceVal.textContent = `${forceEst} N`;
  });

  // Straightening Force Slider
  forceSlider.addEventListener('input', (e) => {
    state.forceN = parseInt(e.target.value, 10);
    forceValDisplay.textContent = `${state.forceN.toLocaleString()} N`;
    if (state.currentStage === 4) {
      hudForceVal.textContent = `${state.forceN.toLocaleString()} N`;
    }
  });

  // Pipe Duration Slider (The 12-Year Proverb Slider)
  pipeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.pipeYears = val;
    let label = `${val} Years`;
    if (val === 12) {
      label += ' (പന്തീരാണ്ട് കൊല്ലം - Critical)';
    } else if (val < 12) {
      label += ' (Not yet 12 years)';
    } else {
      label += ' (Even beyond 12 years!)';
    }
    pipeValDisplay.textContent = label;
  });

  // Clamping Grip Mode Pills
  modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      modePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.clampingMode = pill.dataset.mode;
      if (state.clampingMode === 'gentle') {
        forceSlider.value = 1200;
        state.forceN = 1200;
      } else if (state.clampingMode === 'rigorous') {
        forceSlider.value = 4500;
        state.forceN = 4500;
      } else if (state.clampingMode === 'overkill') {
        forceSlider.value = 9999;
        state.forceN = 9999;
      }
      forceValDisplay.textContent = `${state.forceN.toLocaleString()} N`;
      playScannerBeep(520, 0.08);
    });
  });

  // Sound Toggle Button
  soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      soundIcon.textContent = '🔊';
      soundText.textContent = 'SFX: ON';
      getAudioContext();
      playScannerBeep(880, 0.1);
    } else {
      soundIcon.textContent = '🔇';
      soundText.textContent = 'SFX: OFF';
    }
  });

  // Keyboard Shortcuts (Space = Straighten, R = Reset)
  window.addEventListener('keydown', (e) => {
    // Avoid triggering if active element is an input slider
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.isBusy) {
        startStraighteningSequence();
      }
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetTail(true);
    }
  });

  // ==========================================
  // 9. INITIALIZATION
  // ==========================================
  updateTailGeometry(0);
})();
