-- =============================================
-- Tạo tài khoản Admin đầu tiên
-- =============================================
-- Chạy script này trong Supabase SQL Editor sau khi đã có user đăng ký

-- Nâng cấp tài khoản qtfreshfood@gmail.com thành admin
UPDATE public.user_profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'qtfreshfood@gmail.com'
);

-- Cách 2: Xem danh sách users để lấy email
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- Cách 3: Nâng cấp user đầu tiên thành admin
-- UPDATE public.user_profiles
-- SET role = 'admin'
-- WHERE id = (
--   SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1
-- );

-- Kiểm tra kết quả
SELECT 
  u.email,
  p.full_name,
  p.role,
  p.created_at
FROM auth.users u
JOIN public.user_profiles p ON u.id = p.id
WHERE p.role = 'admin';
