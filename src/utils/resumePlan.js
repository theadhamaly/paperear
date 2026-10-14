export const canResumeHeldAudio = ({ holdToken, currentToken, heldWordIndex, currentWordIndex, hasSource, ended }) =>
    holdToken === currentToken && heldWordIndex === currentWordIndex && Boolean(hasSource) && !ended
