---
title: "[LeetCode] 206. Reverse Linked List"
date: "2019-07-24"
description: "Reverse Linked List Link to original Problem on LeetCode Reverse a singly linked list. Example: Input: 1->2->3->4->5->NULL Output: 5->4->3->2->1->NULL Follow up: A linked list can be reversed either iteratively or recursively. Could you implement both? Company: Adobe, Amazon, MakeMyTrip, Microsoft, Qualcomm, Samsung Solution (Iterative): Time Complexity: Space Complexity: class Solution(object): def reverseList(self, head): \"\"\" :type head: ListNode :rtype: ListNode \"\"\" # Video Explanation: https://youtu.be/sYcOK51hl-A # Credit: mycodeschool prev = None curr = head while curr: next = curr."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Reverse Linked List", "Linked List", "LeetCode", "Algorithm"]
draft: false
---

### Reverse Linked List

[Link to original Problem on LeetCode](https://leetcode.com/problems/reverse-linked-list/)

Reverse a singly linked list.

**Example:**

**Input:** `1->2->3->4->5->NULL` **Output:** `5->4->3->2->1->NULL`

**Follow up:**

A linked list can be reversed either iteratively or recursively. Could you implement both?

**Company:** *Adobe*, *Amazon*, *MakeMyTrip*, *Microsoft*, *Qualcomm*, *Samsung*

**Solution (Iterative):**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def reverseList(self, head):
        """
        :type head: ListNode
        :rtype: ListNode
        """
        # Video Explanation: https://youtu.be/sYcOK51hl-A
        # Credit: mycodeschool

        prev = None
        curr = head
        
        while curr:
            next = curr.next
            curr.next = prev
            prev = curr
            curr = next
            
        return prev
```

**Solution (Recursive):**

```python
class Solution(object):
    def reverseList(self, head):
        """
        :type head: ListNode
        :rtype: ListNode
        """
        # Logic behind recursion is same as that of the iterative version
        # We are just swapping the reference recursively
        return self.reverseListHelper(head, None)
    
    def reverseListHelper(self, curr, prev):
        if curr is None:
            return prev
        
        next = curr.next
        curr.next = prev
        
        return self.reverseListHelper(next, curr)
```
