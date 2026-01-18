# Overshoot SDK Documentation

## Overview

Overshoot is an AI-powered video analysis SDK that runs on **live video streams**. Instead of processing every frame individually, it uses a **rolling window approach** to analyze video in real-time.

## How It Works

### Rolling Window Analysis Pipeline

1. **Buffer frames** until a full window exists (e.g., 1 second of video)
2. **Sample frames** from that window (not all frames - just enough for context)
3. **Send sampled frames + prompt** to the AI model
4. **Receive result** describing what happened in that window
5. **Slide window forward** and repeat → continuous stream of results

**Key Point:** You're not doing per-frame inference. You get "what happened in the last window" outputs at a configurable cadence.

**Typical Latency:** Results arrive continuously, usually within ~300ms.

---

## Basic Usage

### Minimal Setup

```javascript
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'your-api-key',
  prompt: 'Read any visible text',
  source: { type: 'camera', cameraFacing: 'environment' }
})
```

### Required Configuration

- **`apiUrl`**: Overshoot API endpoint (usually `https://cluster1.overshoot.ai/api/v0.2`)
- **`apiKey`**: Your Overshoot secret key
- **`prompt`**: Plain-English instruction for the AI
- **`source`**: Video source (camera or file)

---

## Prompts: Programming with Natural Language

Your `prompt` is plain English describing the task.

**Examples:**
- OCR: `"Read any visible text"`
- Scene description: `"Describe what you see in few words"`
- Object detection: `"Count the number of people"`
- Emergency detection: `"Identify: vehicles, person on ground, visible injuries, smoke, or flames"`

### Dynamic Prompt Updates (CRITICAL FEATURE)

You can **update the prompt mid-stream** without restarting:

```javascript
// Start with one prompt
vision.updatePrompt('Count the number of people')

// Later, change what AI looks for
vision.updatePrompt('Identify smoke or flames')
```

**Use case for Emergency Copilot:** As the user progresses through the protocol state machine, update the prompt to match the current question's needs.

---

## Processing Parameters

These control latency, cost, result frequency, and visual context.

### Available Parameters (with defaults)

```javascript
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'your-api-key',
  prompt: 'Read any visible text',
  processing: {
    clip_length_seconds: 1,    // Window duration (default: 1)
    delay_seconds: 1,           // Result cadence (default: 1)
    fps: 30,                    // Max frames/sec captured (default: 30)
    sampling_ratio: 0.1         // Fraction of frames sent to AI (default: 0.1 = 10%)
  }
})
```

### Parameter Explanations

| Parameter | Default | What It Does | Effect |
|-----------|---------|--------------|--------|
| `clip_length_seconds` | 1 | Window duration analyzed each cycle | **Longer** = more context, slower/heavier |
| `delay_seconds` | 1 | How often you get new results | **Smaller** = more frequent results (higher load) |
| `fps` | 30 | Max frames per second to capture locally | Base capture rate before sampling |
| `sampling_ratio` | 0.1 | Fraction of captured frames sent to AI | **Lower** = faster/cheaper, less coverage |

### Effective Frame Calculations

- **Frames sent per second** ≈ `fps * sampling_ratio`
- **Frames per clip** ≈ `fps * sampling_ratio * clip_length_seconds`

**Example:** With defaults (fps=30, sampling_ratio=0.1, clip_length=1s):
- 30 * 0.1 = 3 frames per second sent to AI
- 3 frames per 1-second clip

### Tuning Guidelines

| Goal | Adjustments |
|------|-------------|
| More temporal context | Increase `clip_length_seconds` |
| More frequent updates | Decrease `delay_seconds` |
| Cheaper/faster | Decrease `sampling_ratio` and/or `fps` |
| Better visual coverage | Increase `sampling_ratio` (and maybe `fps`) |

**For Emergency Copilot:** Start with defaults. Only tune if you need faster refresh or lower costs.

---

## Camera Source Configuration

```javascript
source: {
  type: 'camera',
  cameraFacing: 'environment'  // 'environment' = rear camera, 'user' = front camera
}
```

- **`environment`**: Rear camera (typical for emergency scene capture)
- **`user`**: Front-facing camera

---

## Common Use Cases

Examples from Overshoot docs:
- OCR on camera feeds
- Real-time object detection for blind/low-vision assistance
- "AI Facetime" experiences
- Live sports commentary
- Extracting structured data from video

**Emergency Copilot Use Case:**
- Continuous scene analysis during 911 call
- Detect vehicles, injuries, smoke, fire, person on ground
- Provide "vision hints" to help caller answer protocol questions
- Update prompts as protocol progresses

---

## Integration Pattern for State Machine Apps

For guided flows (like Emergency Copilot's decision tree):

1. **Keep stream running** throughout the session
2. **Use `updatePrompt()`** when state machine advances to next question
3. **Listen for results** to provide vision hints to user
4. **Start with default processing parameters** unless you have specific needs

### Example Flow

```javascript
// Question 1: "Is anyone injured?"
vision.updatePrompt('Identify: person on ground, visible injuries, blood')

// User answers, moves to Question 2: "How many vehicles involved?"
vision.updatePrompt('Count vehicles in scene')

// Question 3: "Is anyone trapped?"
vision.updatePrompt('Identify: person inside damaged vehicle, airbag deployment')
```

---

## Output Structure

Outputs arrive as a **continuous stream**, with one result per processed window.

Each output corresponds to "what happened during the last clip/window."

Your app will typically:
- Start the stream
- Listen for results
- Use results to update UI / state machine / logs
- Provide vision hints to users

---

## Requirements Summary

To run Overshoot, you need:
1. Overshoot `apiKey`
2. Correct `apiUrl` (usually `https://cluster1.overshoot.ai/api/v0.2`)
3. A `prompt` (plain English)
4. A `source` (camera or file)

That's enough to get started with an MVP.

---

## Additional Resources

- Official Docs: Check Overshoot documentation for:
  - "Getting Started"
  - "Video Input"
  - "Stream Configuration"
  - "Understanding Output"
  - "Models"
