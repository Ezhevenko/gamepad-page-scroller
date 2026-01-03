(() => {
  const DEADZONE = 0.25;
  const ANALOG_SCROLL_STEP = 48;
  const DPAD_SCROLL_STEP = 50;
  const BUTTON_REPEAT_MS = 85;
  const TRIGGER_THRESHOLD = 0.35;
  const ZOOM_STEP = 0.1;
  const ZOOM_INTERVAL_MS = 140;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const PAGE_SCROLL_RATIO = 0.9;

  let animationId = null;
  let zoomLevel = readInitialZoom();
  let lastZoomChange = 0;

  const repeatTimers = new Map();

  function dispatchWheelScroll(deltaX, deltaY) {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const target =
      document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) ||
      document.scrollingElement ||
      document.documentElement;

    const wheelEvent = new WheelEvent("wheel", {
      deltaX,
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(wheelEvent);

    if (!wheelEvent.defaultPrevented) {
      (document.scrollingElement || window).scrollBy({
        left: deltaX,
        top: deltaY,
        behavior: "auto",
      });
    }
  }

  function dispatchKeyboardScroll(key) {
    const target =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.body;
    const scrollTarget = document.scrollingElement || document.documentElement;
    const delta =
      key === "PageDown"
        ? window.innerHeight * PAGE_SCROLL_RATIO
        : -window.innerHeight * PAGE_SCROLL_RATIO;

    const keyboardEvent = new KeyboardEvent("keydown", {
      key,
      code: key,
      keyCode: key === "PageDown" ? 34 : 33,
      which: key === "PageDown" ? 34 : 33,
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(keyboardEvent);

    if (!keyboardEvent.defaultPrevented) {
      scrollTarget.scrollBy({
        left: 0,
        top: delta,
        behavior: "auto",
      });
    }
  }

  function readInitialZoom() {
    const existingZoom = parseFloat(document.documentElement.style.zoom);
    return Number.isFinite(existingZoom) && existingZoom > 0 ? existingZoom : 1;
  }

  function normalizeAxisValue(value) {
    const magnitude = Math.abs(value);
    if (magnitude < DEADZONE) {
      return 0;
    }

    const scaled = (magnitude - DEADZONE) / (1 - DEADZONE);
    return Math.sign(value) * scaled;
  }

  function pickAxis(axes, positions) {
    let strongest = 0;
    for (const index of positions) {
      const current = axes[index] ?? 0;
      if (Math.abs(current) > Math.abs(strongest)) {
        strongest = current;
      }
    }
    return strongest;
  }

  function scrollByAnalog(axes) {
    const horizontal = normalizeAxisValue(pickAxis(axes, [0, 2]));
    const vertical = normalizeAxisValue(pickAxis(axes, [1, 3]));

    dispatchWheelScroll(horizontal * ANALOG_SCROLL_STEP, vertical * ANALOG_SCROLL_STEP);
  }

  function shouldRepeat(key, pressed, now) {
    if (!pressed) {
      repeatTimers.delete(key);
      return false;
    }

    const last = repeatTimers.get(key) ?? -Infinity;
    if (now - last >= BUTTON_REPEAT_MS) {
      repeatTimers.set(key, now);
      return true;
    }

    return false;
  }

  function scrollWithButtons(buttons, now) {
    const upPressed = (buttons[12]?.pressed ?? false) || (buttons[12]?.value ?? 0) > 0.5;
    const downPressed = (buttons[13]?.pressed ?? false) || (buttons[13]?.value ?? 0) > 0.5;
    const leftPressed = (buttons[14]?.pressed ?? false) || (buttons[14]?.value ?? 0) > 0.5;
    const rightPressed = (buttons[15]?.pressed ?? false) || (buttons[15]?.value ?? 0) > 0.5;

    if (shouldRepeat("ArrowUp", upPressed, now)) {
      dispatchWheelScroll(0, -DPAD_SCROLL_STEP);
    }
    if (shouldRepeat("ArrowDown", downPressed, now)) {
      dispatchWheelScroll(0, DPAD_SCROLL_STEP);
    }
    if (shouldRepeat("ArrowLeft", leftPressed, now)) {
      dispatchWheelScroll(-DPAD_SCROLL_STEP, 0);
    }
    if (shouldRepeat("ArrowRight", rightPressed, now)) {
      dispatchWheelScroll(DPAD_SCROLL_STEP, 0);
    }
  }

  function handlePageButtons(buttons, now) {
    const pageUpPressed = (buttons[4]?.pressed ?? false) || (buttons[4]?.value ?? 0) > 0.5;
    const pageDownPressed = (buttons[5]?.pressed ?? false) || (buttons[5]?.value ?? 0) > 0.5;

    if (shouldRepeat("PageUp", pageUpPressed, now)) {
      dispatchKeyboardScroll("PageUp");
    }

    if (shouldRepeat("PageDown", pageDownPressed, now)) {
      dispatchKeyboardScroll("PageDown");
    }
  }

  function applyZoom(delta) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));
    if (nextZoom !== zoomLevel) {
      zoomLevel = nextZoom;
      document.documentElement.style.zoom = zoomLevel.toFixed(2);
    }
  }

  function handleZoom(buttons, now) {
    const zoomOutValue = buttons[6]?.value ?? 0;
    const zoomInValue = buttons[7]?.value ?? 0;

    if (now - lastZoomChange < ZOOM_INTERVAL_MS) {
      return;
    }

    if (zoomInValue > TRIGGER_THRESHOLD && zoomInValue > zoomOutValue) {
      applyZoom(ZOOM_STEP * zoomInValue);
      lastZoomChange = now;
    } else if (zoomOutValue > TRIGGER_THRESHOLD) {
      applyZoom(-ZOOM_STEP * zoomOutValue);
      lastZoomChange = now;
    }
  }

  function updateLoop() {
    const now = performance.now();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let hasPad = false;

    for (const pad of pads) {
      if (!pad) {
        continue;
      }

      hasPad = true;
      scrollByAnalog(pad.axes || []);
      scrollWithButtons(pad.buttons || [], now);
      handlePageButtons(pad.buttons || [], now);
      handleZoom(pad.buttons || [], now);
    }

    if (hasPad) {
      animationId = requestAnimationFrame(updateLoop);
    } else {
      animationId = null;
    }
  }

  function startLoop() {
    if (animationId === null) {
      animationId = requestAnimationFrame(updateLoop);
    }
  }

  function stopLoop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  window.addEventListener("gamepadconnected", startLoop);
  window.addEventListener("gamepaddisconnected", () => {
    if (![...(navigator.getGamepads?.() || [])].some(Boolean)) {
      stopLoop();
    }
  });

  if ([...(navigator.getGamepads?.() || [])].some(Boolean)) {
    startLoop();
  }
})();
