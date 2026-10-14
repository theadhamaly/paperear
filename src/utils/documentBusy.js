export const documentBusyReason = ({ docLoading, ocrBusy, rangeLoading }) => {
    if (docLoading) return 'opening'
    if (ocrBusy) return 'ocr'
    if (rangeLoading) return 'pages'
    return null
}

export const unlessBusy = (isBusy, action) => (...args) => {
    if (isBusy()) return undefined
    return action(...args)
}
