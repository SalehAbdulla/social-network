import {
  BadgeCheck,
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Send,
  Edit3,
  MoreVertical,
} from "lucide-react";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticImageData } from "next/image";
import api from "../api/axios";
import toast from "react-hot-toast";
import { imageSrc } from "../lib/imageSrc";
import { dummyUserData } from "../../../public/assets";

interface PostUser {
  _id: string;
  full_name: string;
  username: string;
  profile_picture: string | StaticImageData;
}

interface PostComment {
  _id: string;
  text: string;
  createdAt: string;
  user: PostUser;
}

interface Post {
  _id: string;
  content: string;
  image_urls: string[];
  likes_count: string[];
  user: PostUser;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
  fetchPosts: () => void;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval} year${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval} month${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval} day${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval} hour${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval} minute${interval === 1 ? "" : "s"} ago`;
  return "just now";
}

const PostCard = ({ post, fetchPosts }: PostCardProps) => {
  const postWithHashtags = post.content.replace(
    /(#\w+)/g,
    '<span class="text-blue-600">$1</span>'
  );
  // const currentUser = { _id: userId ?? "" };
  const router = useRouter();
  const currentUser = dummyUserData;
  // states
  const [likes, setLikes] = useState<string[]>(post.likes_count || []);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [editingComment, setEditingComment] = useState<PostComment | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [postMenuOpen, setPostMenuOpen] = useState(false);

  // like / unlike
  // const handleLike = async () => {
  //   try {
  //     const token = await getToken();
  //     const { data } = await api.post(
  //       `/api/post/like`,
  //       { postId: post._id },
  //       { headers: { Authorization: `Bearer ${token}` } }
  //     );
  //     if (data.success) {
  //       setLikes((prev) =>
  //         prev.includes(currentUser._id)
  //           ? prev.filter((id) => id !== currentUser._id)
  //           : [...prev, currentUser._id]
  //       );
  //     } else {
  //       toast.error(data.message);
  //     }
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // fetch comments
  // const fetchComments = async () => {
  //   try {
  //     const token = await getToken();
  //     const { data } = await api.get(`/api/comment/${post._id}`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     if (data.success) {
  //       setComments(data.comments);
  //     }
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // // toggle comments
  // const toggleComments = () => {
  //   setShowComments((prev) => !prev);
  //   // if (!showComments) fetchComments();
  // };

  // // add / edit comment
  // const handleSubmitComment = async () => {
  //   if (!newComment.trim()) return;
  //   try {
  //     // const token = await getToken();

  //     if (editingComment) {
  //       // edit existing
  //       const { data } = await api.put(
  //         `/api/comment/edit`,
  //         { commentId: editingComment._id, text: newComment },
  //         // { headers: { Authorization: `Bearer ${token}` } }
  //       );
  //       if (data.success) {
  //         toast.success("Comment updated");
  //         setEditingComment(null);
  //         // fetchComments(); // refresh
  //       } else {
  //         toast.error(data.message);
  //       }
  //     } else {
  //       // add new
  //       const { data } = await api.post(
  //         `/api/comment/add`,
  //         { postId: post._id, text: newComment },
  //         { headers: { Authorization: `Bearer ${token}` } }
  //       );
  //       if (data.success) {
  //         toast.success("Comment added");
  //         fetchComments(); // refresh after adding
  //       } else {
  //         toast.error(data.message);
  //       }
  //     }

  //     setNewComment("");
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // // delete comment
  // const handleDeleteComment = async (commentId: string) => {
  //   try {
  //     const token = await getToken();
  //     const { data } = await api.delete(`/api/comment/delete`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //       data: { commentId },
  //     });
  //     if (data.success) {
  //       toast.success("Comment deleted");
  //       fetchComments(); // refresh
  //     } else {
  //       toast.error(data.message);
  //     }
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // // delete post
  // const handleDeletePost = async () => {
  //   try {
  //     const token = await getToken();
  //     const { data } = await api.delete(`/api/post/${post._id}`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     if (data.success) {
  //       toast.success("Post deleted");
  //       if (fetchPosts) fetchPosts();
  //     } else {
  //       toast.error(data.message);
  //     }
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // // share
  // const handleShare = () => {
  //   const link = `${window.location.origin}/post/${post._id}`;
  //   navigator.clipboard.writeText(link);
  //   toast.success("Post link copied!");
  // };

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-4 w-full max-w-2xl">
      {/* user info + menu */}
      <div className="flex justify-between items-start">
        <div
          onClick={() => router.push("/profile/" + post.user._id)}
          className="inline-flex items-center gap-3 cursor-pointer"
        >
          <img
            src={imageSrc(post.user.profile_picture)}
            alt=""
            className="w-10 h-10 rounded-full shadow"
          />
          <div>
            <div className="flex items-center space-x-1">
              <span>{post.user.full_name}</span>
              <BadgeCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-gray-500 text-sm">
              @{post.user.username} · {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>

        {/* post menu (only owner can delete) */}
        {post.user._id === currentUser._id && (
          <div className="relative">
            <MoreVertical
              className="w-5 h-5 text-gray-600 cursor-pointer"
              onClick={() => setPostMenuOpen((prev) => !prev)}
            />
            {postMenuOpen && (
              <div className="absolute right-0 mt-1 bg-white border rounded shadow-md text-sm z-10">
                <div
                  className="px-3 py-1 hover:bg-gray-100 cursor-pointer flex items-center gap-1 text-red-500"
                  // onClick={handleDeletePost}
                >
                  <Trash2 className="w-4 h-4" /> Delete Post
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* content */}
      {post.content && (
        <div
          className="text-gray-800 text-sm whitespace-pre-line"
          dangerouslySetInnerHTML={{ __html: postWithHashtags }}
        />
      )}

      {/* images */}
      {post.image_urls?.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {post.image_urls.map((img, index) => (
            <img
              key={index}
              src={img}
              alt=""
              className={`w-full h-48 object-cover rounded-lg ${
                post.image_urls.length === 1 && "col-span-2 h-auto"
              }`}
            />
          ))}
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-4 text-gray-600 text-sm pt-2 border-t border-gray-300">
        <div className="flex items-center gap-1">
          <Heart
            className={`w-4 h-4 cursor-pointer ${
              likes.includes(currentUser._id) && "text-red-500 fill-red-500"
            }`}
            // onClick={handleLike}
          />
          <span>{likes.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <MessageCircle
            className="w-4 h-4 cursor-pointer"
            // onClick={toggleComments}
          />
          <span>{comments.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* <Share2 className="w-4 h-4 cursor-pointer" onClick={handleShare} /> */}
        </div>
      </div>

      {/* comments section */}
      {showComments && (
        <div className="pt-3 border-t border-gray-200 space-y-3">
          {/* add / edit comment */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 border rounded-md p-2 text-sm"
            />
            <button
              // onClick={handleSubmitComment}
              className="bg-blue-500 text-white px-3 py-1 rounded"
            >
              {editingComment ? "Update" : "Post"}
            </button>
          </div>

          {/* comments list */}
          {comments.length === 0 && (
            <div className="text-sm text-gray-500">No comments yet</div>
          )}
          {comments.map((c) => (
            <div key={c._id} className="flex items-start gap-2 relative">
              <img
                src={imageSrc(c.user.profile_picture)}
                alt=""
                className="w-8 h-8 rounded-full"
              />
              <div className="flex-1">
                <div className="text-sm">
                  <span className="font-semibold">{c.user.username}</span>{" "}
                  {c.text}
                </div>
                <div className="text-xs text-gray-500">
                  {timeAgo(c.createdAt)}
                </div>
              </div>

              {c.user._id === currentUser._id && (
                <div className="relative">
                  <MoreVertical
                    className="w-4 h-4 cursor-pointer text-gray-600"
                    onClick={() =>
                      setMenuOpen(menuOpen === c._id ? null : c._id)
                    }
                  />
                  {menuOpen === c._id && (
                    <div className="absolute right-0 mt-1 bg-white border rounded shadow-md text-sm z-10">
                      <div
                        className="px-3 py-1 hover:bg-gray-100 cursor-pointer flex items-center gap-1"
                        onClick={() => {
                          setNewComment(c.text);
                          setEditingComment(c);
                          setMenuOpen(null);
                        }}
                      >
                        <Edit3 className="w-4 h-4" /> Edit
                      </div>
                      <div
                        className="px-3 py-1 hover:bg-gray-100 cursor-pointer flex items-center gap-1 text-red-500"
                        onClick={() => {
                          // handleDeleteComment(c._id);
                          setMenuOpen(null);
                        }}
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PostCard;
