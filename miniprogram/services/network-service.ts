export const getNetworkType = () => new Promise<string>((resolve, reject) => wx.getNetworkType({
  success: (result) => resolve(result.networkType),
  fail: reject
}))

export const isOnline = async () => (await getNetworkType()) !== 'none'

export const observeNetworkRecovery = (listener: () => void) => {
  const onStatusChange = (result: { isConnected: boolean }) => {
    if (result.isConnected) listener()
  }
  wx.onNetworkStatusChange(onStatusChange)
  return () => wx.offNetworkStatusChange(onStatusChange)
}
