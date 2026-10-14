import { useEffect } from 'react'
import { systemSpeech } from '../utils/systemSpeech'
import { isNativeRangeArrow } from '../utils/shortcutTarget'

/**
 * useKeyboardShortcuts — Keyboard shortcut handler extracted from App.jsx.
 * @param {object} sequencer - The sequencer instance from useSequencer.
 */
export function useKeyboardShortcuts(sequencer) {
    const {
        currentTextRef,
        currentWordsRef,
        currentWordIndexRef,
        currentWPMRef,
        currentPlaybackRateRef,
        startSequencerRef,
        skipForwardWordRef,
        skipBackwardWordRef,
        skipForwardParagraphRef,
        skipBackwardParagraphRef,
        debouncedSettingsChangeRef,
        requestSeamlessApplyRef,
        isPausedRef,
        isPlayingRef,
        beginManualSeekIntent,
        setCurrentWPM,
        setPlaybackRate,
        wpmToRate,
        scrollToCurrentWord,
        restartFromTop,
        volumeBy,
        rapidNavigationTimer,
        startKeyboardSeek,
        stopKeyboardSeek,
        muteToggle,
        reportWord,
    } = sequencer

    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = e.target.tagName
            const inputType = e.target.type
            const isTypingField =
                tag === 'TEXTAREA' ||
                (tag === 'INPUT' && inputType !== 'range' && inputType !== 'button' && inputType !== 'submit') ||
                e.target.isContentEditable

            if (isTypingField || isNativeRangeArrow(e)) return

            switch (e.code) {
                case 'Home':
                    if (!e.ctrlKey) break
                    if (e.repeat) return
                    e.preventDefault()
                    if (!currentTextRef.current.trim()) return
                    restartFromTop?.()
                    break

                case 'Space':
                    if (e.repeat) return
                    e.preventDefault()

                    if (!currentTextRef.current.trim()) return

                    // Check for Ctrl+Space to scroll to current word
                    if (e.ctrlKey) {
                        scrollToCurrentWord()
                        return
                    }

                    if (rapidNavigationTimer.current) {
                        clearTimeout(rapidNavigationTimer.current)
                        rapidNavigationTimer.current = null
                    }

                    beginManualSeekIntent(120)
                    if (isPausedRef.current) {
                        sequencer.resume()
                    } else if (isPlayingRef.current) {
                        systemSpeech.cancel()
                        sequencer.pause()
                    } else {
                        sequencer.speak()
                    }
                    break

                case 'ArrowLeft':
                    e.preventDefault()
                    if (!currentWordsRef.current.length) return
                    startKeyboardSeek?.()
                    if (e.ctrlKey) {
                        skipBackwardParagraphRef.current?.()
                    } else {
                        skipBackwardWordRef.current?.()
                    }
                    break

                case 'ArrowRight':
                    e.preventDefault()
                    if (!currentWordsRef.current.length) return
                    startKeyboardSeek?.()
                    if (e.ctrlKey) {
                        skipForwardParagraphRef.current?.()
                    } else {
                        skipForwardWordRef.current?.()
                    }
                    break

                case 'ArrowUp':
                    e.preventDefault()
                    if (e.ctrlKey) { volumeBy?.(0.1); break }
                    {
                        const newWPM = Math.min(currentWPMRef.current + 10, 450)
                        setCurrentWPM(newWPM)
                        const nextRate = wpmToRate(newWPM)
                        setPlaybackRate(nextRate)
                        currentPlaybackRateRef.current = nextRate
                        requestSeamlessApplyRef?.current?.()
                    }
                    break

                case 'ArrowDown':
                    e.preventDefault()
                    if (e.ctrlKey) { volumeBy?.(-0.1); break }
                    {
                        const newWPM = Math.max(currentWPMRef.current - 10, 75)
                        setCurrentWPM(newWPM)
                        const nextRate = wpmToRate(newWPM)
                        setPlaybackRate(nextRate)
                        currentPlaybackRateRef.current = nextRate
                        requestSeamlessApplyRef?.current?.()
                    }
                    break

                case 'KeyM':
                    if (e.repeat) return
                    e.preventDefault()
                    muteToggle?.()
                    break

                case 'KeyR':
                    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
                    if (!currentWordsRef.current.length) return
                    e.preventDefault()
                    reportWord?.()
                    break

                default:
                    break
            }
        }

        const handleKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                stopKeyboardSeek?.()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
        }
    }, [sequencer])
}
