const otpTemplate = (otpCode) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 10px; overflow: hidden;">
      <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">WeConnect</h1>
      </div>
      <div style="padding: 30px; line-height: 1.6; color: #333;">
        <h2 style="color: #007bff;">Xác thực quên mật khẩu</h2>
        <p>Chào bạn,</p>
        <p>Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản WeConnect của bạn. Vui lòng sử dụng mã OTP dưới đây để tiếp tục:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff; background: #f0f7ff; padding: 10px 20px; border-radius: 5px; border: 1px dashed #007bff;">
            ${otpCode}
          </span>
        </div>
        
        <p style="font-size: 14px; color: #666;">Mã này sẽ hết hạn sau <b>120 giây</b>. Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua email này để đảm bảo an toàn.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">
          © 2026 WeConnect Team. All rights reserved.<br>
          Đây là email tự động, vui lòng không phản hồi.
        </p>
      </div>
    </div>
  `;
};

export default otpTemplate;
