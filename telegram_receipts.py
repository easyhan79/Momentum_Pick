"""Retry stored Telegram receipt notifications without logging chats or payloads."""
RECEIPT='📝 매물 자료를 저장했습니다. 같은 앨범의 사진은 한 매물로 묶습니다. 분석 대기열에 등록했으며 완료되면 안내합니다. 다시 보내지 않으셔도 됩니다.'

def drain(api,send,emit=print,limit=10):
    sent=failed=0
    for _ in range(limit):
        receipt=api('telegram_receipt_claim',{'p_property':None})
        if not receipt:break
        success=False
        try:success=send(receipt['chat_id'],RECEIPT) is True
        except Exception:pass
        if not api('telegram_receipt_complete',{'p_property':receipt['property_id'],'p_token':receipt['token'],'p_success':success,'p_error':'' if success else 'worker_delivery_failed'}):
            raise RuntimeError('receipt_claim_lost')
        if success:sent+=1
        else:failed+=1
    emit(f'telegram receipts sent={sent} deferred={failed}',flush=True)
    return {'sent':sent,'deferred':failed}
