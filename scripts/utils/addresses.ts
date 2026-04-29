export const ADDRESSES = {
  sepolia: {
    chainId: 11155111,
    UniswapV3Factory:           "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    NonfungiblePositionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
    SwapRouter02:               "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    WETH9:                      "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
  mainnet: {
    chainId: 1,
    UniswapV3Factory:           "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    NonfungiblePositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    SwapRouter02:               "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    WETH9:                      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
} as const;

export function getAddresses(chainId: number) {
  if (chainId === 11155111) return ADDRESSES.sepolia;
  if (chainId === 1) return ADDRESSES.mainnet;
  throw new Error(`Unsupported chain: ${chainId}`);
}