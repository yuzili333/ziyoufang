export const getNetworkType = () => new Promise<string>((resolve, reject) => wx.getNetworkType({
  success: (result) => resolve(result.networkType),
  fail: reject
}))

export const isOnline = async () => (await getNetworkType()) !== 'none'
