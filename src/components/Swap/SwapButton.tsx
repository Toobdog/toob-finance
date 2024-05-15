"use client"

import { useWeb3Modal } from "@web3modal/wagmi/react"
import {
  useAccount,
  useBalance,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi"
import useSwapParams from "../../hooks/useSwapParams"
import { Token, tryParseAmount } from "@/packages/currency"
import Spinner from "../Spinner"
import React, { useState } from "react"
import { ApprovalState, useTokenApproval } from "@/hooks/useTokenApproval"
import { ROUTE_PROCESSOR_3_ADDRESS } from "@/packages/config"
import { ChainId } from "@/packages/chain"
import { UseQueryResult } from "@tanstack/react-query"
import { routeProcessor3Abi } from "@/packages/abi"
import toast from "react-hot-toast"
import CustomToast from "../CustomToast"

interface SwapButtonProps {
  trade: UseQueryResult<any, Error>
}

const SwapButton: React.FC<SwapButtonProps> = ({ trade }) => {
  const { address, chainId } = useAccount()
  const { open } = useWeb3Modal()
  const { amountIn, amountOut, tokenIn, tokenOut } = useSwapParams()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const [loading, setLoading] = useState(false)

  const parsedAmount = tryParseAmount(amountIn, tokenIn)

  const [approvalState, approve, approvalRequest] = useTokenApproval({
    amount: parsedAmount,
    spender: ROUTE_PROCESSOR_3_ADDRESS[ChainId.ARBITRUM_ONE],
    enabled: Boolean(parsedAmount),
  })

  const onSwap = async () => {
    if (!address || !publicClient || !walletClient) {
      open?.()
    } else if (chainId !== ChainId.ARBITRUM_ONE) {
      switchChainAsync?.({ chainId: ChainId.ARBITRUM_ONE })
    } else {
      try {
        const swapTrade = { ...trade }

        setLoading(true)
        const { request } = await publicClient.simulateContract({
          account: address,
          abi: routeProcessor3Abi,
          address: ROUTE_PROCESSOR_3_ADDRESS[ChainId.ARBITRUM_ONE],
          functionName: "toobExecute",
          args: swapTrade.data?.writeArgs,
          value: swapTrade.data?.value,
        })

        const hash = await walletClient.writeContract(request)
        toast.custom((t) => (
          <CustomToast
            t={t}
            type="info"
            text={`Swap ${swapTrade?.data?.amountIn?.toSignificant(6)} ${
              swapTrade?.data?.amountIn?.currency?.symbol
            } for ${swapTrade?.data?.amountOut?.toSignificant(6)} ${
              swapTrade?.data?.amountOut?.currency?.symbol
            }`}
            hash={hash}
          />
        ))

        const res = await publicClient.waitForTransactionReceipt({ hash })

        toast.custom((t) => (
          <CustomToast
            t={t}
            type="success"
            text={`Swap ${swapTrade?.data?.amountIn?.toSignificant(6)} ${
              swapTrade?.data?.amountIn?.currency?.symbol
            } for ${swapTrade?.data?.amountOut?.toSignificant(6)} ${
              swapTrade?.data?.amountOut?.currency?.symbol
            }`}
            hash={hash}
          />
        ))

        console.log(res)
      } catch (err) {
        console.log(err)
      } finally {
        setLoading(false)
      }
    }
  }

  const onApprove = () => {
    try {
      approve(approvalRequest)
    } catch (err) {
      console.log(err)
    }
  }

  const { data: balance } = useBalance({
    address,
    token: tokenIn instanceof Token ? tokenIn.address : undefined,
    query: {
      enabled: Boolean(address) && Boolean(tokenIn),
      refetchInterval: 30000,
    },
  })

  const fetching =
    Boolean(tokenIn) &&
    Boolean(tokenOut) &&
    Boolean(parsedAmount?.greaterThan(0n)) &&
    (trade.isFetching || trade.isLoading || trade.isPending)
  const wrongNetworkError = chainId !== ChainId.ARBITRUM_ONE
  const nonAssetError = !tokenIn || !tokenOut
  const nonAmountError = !(
    tokenIn &&
    amountIn &&
    tryParseAmount(amountIn, tokenIn)?.greaterThan(0n)
  )
  const insufficientBalanceError =
    Number(amountIn) > Number(balance?.formatted ?? "0")

  const isError =
    wrongNetworkError ||
    nonAmountError ||
    nonAssetError ||
    insufficientBalanceError

  return (
    <div className="mt-4">
      {!fetching &&
      !isError &&
      trade.data &&
      (approvalState === ApprovalState.NOT_APPROVED ||
        approvalState === ApprovalState.PENDING) ? (
        <button
          className="flex items-center justify-center h-12 w-full bg-[#d8c7ad] text-white border-b-2 border-[#d1bc9c] enabled:hover:bg-[#d1bc9c] enabled:hover:border-[#c0ac8e] transition-all rounded-full mt-8 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onApprove}
          disabled={approvalState === ApprovalState.PENDING}
        >
          <>
            {approvalState === ApprovalState.PENDING ? (
              <Spinner className="w-5 h-5 mr-2" />
            ) : null}
            Approve {tokenIn?.symbol}
          </>
        </button>
      ) : null}
      <button
        className="flex items-center justify-center h-12 w-full bg-[#d8c7ad] text-white border-b-2 border-[#d1bc9c] enabled:hover:bg-[#d1bc9c] enabled:hover:border-[#c0ac8e] transition-all rounded-full font-semibold disabled:opacity-40 disabled:cursor-not-allowed mt-4"
        onClick={onSwap}
        disabled={
          isError ||
          !(approvalState === ApprovalState.APPROVED) ||
          fetching ||
          loading
        }
      >
        {fetching ? (
          <>
            <Spinner className="w-5 h-5 mr-2" />
            Fetching Best Trade
          </>
        ) : loading ? (
          <>
            <Spinner className="w-5 h-5 mr-2" />
            Waiting for Confirmation
          </>
        ) : !address ? (
          "Connect Wallet"
        ) : wrongNetworkError ? (
          "Switch Network"
        ) : nonAssetError ? (
          "Select Asset to Trade"
        ) : nonAmountError ? (
          "Input Amount to Trade"
        ) : insufficientBalanceError ? (
          `Insufficient ${tokenIn?.symbol} Balance`
        ) : (
          "Swap"
        )}
      </button>
    </div>
  )
}

export default SwapButton